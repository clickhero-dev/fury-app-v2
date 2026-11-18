"""Isolated Agno provider failover. Never restarts a turn after output or a tool call."""
import os
import json
import re
from collections.abc import Mapping

import httpx
from model_request_budget import admit_model_request, ModelRequestBudgetExceeded


class ProviderFailure(Exception):
    """Safe public error; provider bodies and credentials are never included."""
    def __init__(self, kind, provider=None):
        self.kind = kind
        self.provider = provider
        super().__init__('Model provider request failed')


class PersistenceAdmissionFailure(Exception):
    """The durable request budget could not be checked or recorded."""


_PROVIDERS = (
    ('OPENAI_API_KEY', 'gpt-6-luna', 'openai'),
    ('ANTHROPIC_API_KEY', 'claude-sonnet-5-5', 'anthropic'),
    ('OPENROUTER_API_KEY', 'google/gemini-3.8-flash', 'openrouter'),
)


def _status_kind(status):
    if status in (401, 403):
        return 'auth'
    if status in (408, 409, 429) or 500 <= status <= 599:
        return 'transient'
    return 'invalid'


class _Stream(httpx.AsyncByteStream):
    def __init__(self, response, state):
        self.response, self.state = response, state

    async def __aiter__(self):
        try:
            pending = b''
            terminal = False
            if self.response.is_stream_consumed:
                async def chunks():
                    yield self.response.content
            else:
                chunks = self.response.aiter_raw
            async for chunk in chunks():
                pending += chunk
                if len(pending) > 4_000_000:
                    self.state['kind'] = 'invalid'
                    raise httpx.ReadError('Model provider stream exceeded limit')
                while match := re.search(rb'\r\n\r\n|\n\n|\r\r', pending):
                    frame, pending = pending[:match.start()], pending[match.end():]
                    lines = re.split(rb'\r\n|\r|\n', frame)
                    data = b'\n'.join(line[5:].removeprefix(b' ') for line in lines if line.startswith(b'data:'))
                    if not data:
                        continue
                    if data == b'[DONE]':
                        terminal = True
                    else:
                        try:
                            payload = json.loads(data)
                        except (ValueError, UnicodeDecodeError):
                            self.state['kind'] = 'invalid'
                            raise httpx.ReadError('Model provider stream malformed') from None
                        if not isinstance(payload, dict):
                            self.state['kind'] = 'invalid'
                            raise httpx.ReadError('Model provider stream malformed')
                        if 'error' in payload or b'event: error' in lines:
                            error = payload.get('error')
                            code = error.get('code') if isinstance(error, dict) else None
                            self.state['kind'] = _status_kind(code) if type(code) is int else 'invalid'
                            raise httpx.ReadError('Model provider stream failed')
                        block = payload.get('content_block')
                        if isinstance(block, dict) and block.get('type') in ('tool_use', 'server_tool_use'):
                            self.state['unsafe'] = True
                        for choice in payload.get('choices', []):
                            if isinstance(choice, dict) and isinstance(choice.get('delta'), dict):
                                delta = choice['delta']
                                if delta.get('tool_calls') or delta.get('function_call'):
                                    self.state['unsafe'] = True
                        reasons = [c.get('finish_reason') for c in payload.get('choices', []) if isinstance(c, dict)]
                        if any(reason in ('length', 'content_filter', 'error') for reason in reasons):
                            self.state['kind'] = 'transient' if 'error' in reasons else 'invalid'
                            raise httpx.ReadError('Model provider stream failed')
                        if payload.get('type') == 'message_stop' or any(reason in ('stop', 'tool_calls', 'function_call') for reason in reasons):
                            terminal = True
                    yield frame + b'\n\n'
            if not terminal:
                self.state['kind'] = 'transient'
                raise httpx.ReadError('Model provider stream incomplete')
        except httpx.TimeoutException:
            self.state['kind'] = 'transient'
            raise httpx.ReadTimeout('Model provider timeout') from None
        except httpx.HTTPError:
            if self.state['kind'] == 'error':
                self.state['kind'] = 'transient'
            raise httpx.ReadError('Model provider stream failed') from None

    async def aclose(self):
        await self.response.aclose()


class _Transport(httpx.AsyncBaseTransport):
    def __init__(self, client, state):
        self.client, self.state = client, state

    async def handle_async_request(self, request):
        try:
            await admit_model_request(request.content)
        except ModelRequestBudgetExceeded:
            self.state['admission'] = 'budget'
            raise ModelRequestBudgetExceeded('Limite seguro de requisição atingido.') from None
        except Exception:
            self.state['admission'] = 'persistence'
            raise PersistenceAdmissionFailure('Não foi possível validar o orçamento da resposta.') from None
        try:
            response = await self.client.send(request, stream=True)
        except httpx.TimeoutException:
            self.state['kind'] = 'transient'
            raise httpx.ReadTimeout('Model provider timeout') from None
        except httpx.HTTPError:
            self.state['kind'] = 'transient'
            raise httpx.ConnectError('Model provider connection failed') from None
        if response.status_code >= 400:
            self.state['kind'] = _status_kind(response.status_code)
            status = response.status_code
            await response.aclose()
            return httpx.Response(status, json={'error': {'message': 'Model provider request failed', 'type': 'provider_error'}})
        if 'text/event-stream' not in response.headers.get('content-type', ''):
            self.state['kind'] = 'invalid'
            await response.aclose()
            raise httpx.ReadError('Model provider returned an invalid stream')
        return httpx.Response(response.status_code, headers=response.headers, stream=_Stream(response, self.state))


def _model(provider, model_id, key, client):
    if provider == 'openai':
        from agno.models.openai import OpenAIChat
        cls = OpenAIChat
    elif provider == 'anthropic':
        from agno.models.anthropic import Claude
        return Claude(id=model_id, api_key=key, http_client=client, timeout=60,
                      client_params={'max_retries': 0}, retries=0)
    else:
        from agno.models.openrouter import OpenRouter
        cls = OpenRouter
    return cls(id=model_id, api_key=key, http_client=client, timeout=60, max_retries=0, retries=0)


async def stream_agent(context, *, env: Mapping | None = None, http_client=None, agent_options=None):
    """Yield Agno events; transient/auth failures can switch providers only before effects.

    Supply a fresh run context and explicit agent options; this function owns the
    per-attempt Agent. Caller must not enable Agno persistence or retry the turn.
    """
    from agno.agent import Agent

    env = os.environ if env is None else env
    providers = [(model, provider, env.get(key)) for key, model, provider in _PROVIDERS if env.get(key)]
    if not providers:
        raise ProviderFailure('configuration')
    options = dict(agent_options or {})
    if any(k in options for k in ('model', 'db', 'storage', 'session_id')) or options.get('retries', 0) != 0:
        raise ProviderFailure('configuration')
    state = {'unsafe': False, 'kind': 'error', 'admission': None}
    hooks = list(options.pop('tool_hooks', None) or [])

    async def fence(function, args, function_name=None):
        state['unsafe'] = True
        return await function(**args)

    options['tool_hooks'] = [*hooks, fence]
    options.setdefault('telemetry', False)
    owned = http_client is None
    upstream = http_client or httpx.AsyncClient(timeout=60)
    try:
        async with httpx.AsyncClient(transport=_Transport(upstream, state), timeout=60) as client:
            for model_id, provider, key in providers:
                state['kind'] = 'error'
                try:
                    model = _model(provider, model_id, key, client)
                    agent = Agent(model=model, **options)
                    async for event in agent.arun(context, stream=True):
                        if getattr(event, 'event', None) == 'RunError':
                            if state['admission'] == 'budget':
                                raise ModelRequestBudgetExceeded('Limite seguro de requisição atingido.')
                            if state['admission'] == 'persistence':
                                raise PersistenceAdmissionFailure('Não foi possível validar o orçamento da resposta.')
                            raise ProviderFailure(state['kind'], provider)
                        if getattr(event, 'content', None):
                            state['unsafe'] = True
                        yield event
                    return
                except ProviderFailure as error:
                    if state['unsafe'] or error.kind not in ('transient', 'auth'):
                        raise
                except (ImportError, ModuleNotFoundError):
                    raise ProviderFailure('configuration') from None
            raise ProviderFailure(state['kind'], provider)
    finally:
        if owned:
            await upstream.aclose()


async def collect_text(context, *, instructions, env=None, http_client=None):
    """Collect a complete auxiliary response; never return partial output."""
    parts = []
    async for event in stream_agent(context, env=env, http_client=http_client,
                                    agent_options={'instructions': instructions}):
        content = getattr(event, 'content', None)
        if isinstance(content, str):
            parts.append(content)
    return ''.join(parts)
