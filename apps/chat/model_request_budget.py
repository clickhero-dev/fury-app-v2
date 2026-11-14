"""Fail-closed size guard for every OpenRouter chat-completion request."""
import json
import asyncio
import re
import random
import time
import math
import logging
from uuid import uuid4
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Callable

import httpx
from openai import OpenAIError

from memory import count_tokens

MAX_MODEL_REQUEST_TOKENS = 50_000
MODEL_RESPONSE_RESERVE_TOKENS = 4_096
DEEPSEEK_V4_MODEL = 'deepseek/deepseek-v4-pro-0813'
MAX_PROVIDER_ATTEMPTS = 3
MAX_RETRY_WAIT_SECONDS = 20
MAX_REQUEST_RETRY_SECONDS = 200


class ModelRequestBudgetExceeded(OpenAIError):
    """Safe-to-surface rejection that the OpenAI SDK will not wrap as a network error."""


def is_model_request_budget_error(error: Exception) -> bool:
    """Recognize the guard error after Agno wraps it in a provider exception."""
    seen = set()
    current = error
    while current is not None and id(current) not in seen:
        if isinstance(current, ModelRequestBudgetExceeded):
            return True
        seen.add(id(current))
        current = getattr(current, '__cause__', None) or getattr(current, '__context__', None)
    return False


def estimate_request_tokens(body: bytes, *, counter: Callable[[str], int] | None = None, response_reserve: int = MODEL_RESPONSE_RESERVE_TOKENS) -> int:
    """Conservatively count the serialized request plus response/framing reserve."""
    try:
        text = body.decode('utf-8')
        payload = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ModelRequestBudgetExceeded('Não foi possível validar o tamanho da requisição do modelo.') from error

    if not isinstance(payload, dict):
        raise ModelRequestBudgetExceeded('Não foi possível validar o tamanho da requisição do modelo.')
    model = payload.get('model')
    try:
        input_tokens = (counter or count_tokens)(text) if model == DEEPSEEK_V4_MODEL else len(body)
    except Exception as error:
        raise ModelRequestBudgetExceeded('Não foi possível validar o tamanho da requisição do modelo.') from error
    return input_tokens + response_reserve + 16


_retry_state = ContextVar('provider_retry_state', default=None)


@contextmanager
def provider_retry_scope(run_id=None):
    state = {'unsafe': False, 'error_kind': 'error', 'run_id': str(run_id) if run_id else None}
    token = _retry_state.set(state)
    try:
        yield state
    finally:
        _retry_state.reset(token)


def mark_provider_output():
    state = _retry_state.get()
    if state is not None:
        state['unsafe'] = True


class SanitizedEventStream(httpx.AsyncByteStream):
    def __init__(self, inner, state):
        self.inner, self.state = inner, state
        self.events = self.parse_events()
        self.first = None
        self.error_code = None
        self.terminal = False

    async def parse_events(self):
        pending = b''
        try:
            async for chunk in self.inner:
                pending += chunk
                if len(pending) > 4_000_000:
                    raise httpx.ReadError('Model provider stream exceeded safe limit')
                while True:
                    match = re.search(rb'\r\n\r\n|\n\n|\r\r', pending)
                    if not match:
                        break
                    event, pending = pending[:match.start()], pending[match.end():]
                    cleaned = self.clean_event(event)
                    if cleaned is not None:
                        yield cleaned
            if pending:
                cleaned = self.clean_event(pending)
                if cleaned is not None:
                    yield cleaned
            if not self.terminal:
                raise httpx.ReadError("Model provider stream incomplete")
        except httpx.TimeoutException:
            if self.state is not None:
                self.state['error_kind'] = 'timeout'
            raise httpx.ReadTimeout('Model provider timeout') from None
        except httpx.HTTPError:
            raise httpx.ReadError('Model provider stream failed') from None

    def clean_event(self, event):
        lines = re.split(rb'\r\n|\r|\n', event)
        if all(not line or line.startswith(b':') for line in lines):
            return None
        data = b'\n'.join(line[5:].removeprefix(b' ') for line in lines if line.startswith(b'data:'))
        event_error = any(line.strip() == b'event: error' for line in lines)
        if not event_error and not any(line.startswith(b'data:') or line == b'data' for line in lines):
            return None
        if data == b'[DONE]' and not event_error:
            self.terminal = True
            return b'data: [DONE]\n\n'
        try:
            payload = json.loads(data)
        except (ValueError, UnicodeDecodeError):
            payload = None
        if event_error or not isinstance(payload, dict) or 'error' in payload or not isinstance(payload.get('choices'), list):
            self.terminal = True
            error = payload.get('error') if isinstance(payload, dict) else None
            code = error.get('code') if isinstance(error, dict) else None
            self.error_code = code if type(code) is int else None
            if self.state is not None:
                self.state['error_kind'] = 'auth' if code in (401, 403) else 'error'
            return b'data: ' + json.dumps({'error': {'message': 'Model provider request failed', 'code': self.error_code}}).encode() + b'\n\n'
        reasons = [choice.get('finish_reason') for choice in payload['choices'] if isinstance(choice, dict)]
        if any(reason in ('error', 'length', 'content_filter') for reason in reasons):
            raise httpx.ReadError('Model provider stream failed')
        if any(reason in ('stop', 'tool_calls', 'function_call') for reason in reasons):
            self.terminal = True
        return b'data: ' + json.dumps(payload).encode() + b'\n\n'

    async def prime(self):
        # Discard only strictly role-only preambles. Never buffer content or tool
        # calls; after a bounded number of preambles fall back to streaming.
        for _ in range(32):
            self.first = await anext(self.events, None)
            if self.first is None or self.state is None or self.state['unsafe']:
                return
            try:
                payload = json.loads(self.first.removeprefix(b'data: '))
                choices = payload['choices']
                role_only = (
                    set(payload) <= {'id', 'object', 'created', 'model', 'system_fingerprint', 'service_tier', 'choices'}
                    and bool(choices) and all(
                        set(choice) <= {'index', 'delta', 'finish_reason'}
                        and choice.get('finish_reason') is None
                        and choice.get('delta') == {'role': 'assistant'}
                        for choice in choices
                    )
                )
            except (ValueError, TypeError, KeyError, AttributeError):
                role_only = False
            if not role_only:
                return
        # Preserve the final event at the limit; retry is no longer possible.

    async def __aiter__(self):
        if self.first is not None:
            yield self.first
        async for event in self.events:
            yield event

    async def aclose(self):
        await self.inner.aclose()


class SafeProviderTransport(httpx.AsyncBaseTransport):
    """Retry only a pre-output request; never pass provider error bodies to SDK logs."""
    def __init__(self, inner):
        self.inner = inner

    async def handle_async_request(self, request):
        is_chat = request.method == 'POST' and request.url.path.endswith('/chat/completions')
        if not is_chat:
            return await self.inner.handle_async_request(request)
        state = _retry_state.get()
        correlation = uuid4().hex
        started = time.monotonic()
        waited = 0.0
        run_id = state.get('run_id') if state else None
        try:
            model = json.loads(request.content).get('model', '')
        except (ValueError, AttributeError):
            model = ''
        model = model if isinstance(model, str) and re.fullmatch(r'[a-zA-Z0-9/._:-]{1,128}', model) else 'unknown'

        async def retry(attempt, status=None, headers=None, *, retryable=True):
            nonlocal waited
            log = logging.getLogger('ady.chat')
            log.warning('provider_attempt request=%s run=%s model=%s phase=%s attempt=%s status=%s', correlation, run_id, model, 'initial_failure' if attempt == 0 else 'failure', attempt + 1, status)
            delay = 0.1 * (2 ** attempt) + random.uniform(0, 0.1)
            hint = (headers or {}).get('retry-after')
            if hint:
                try:
                    seconds = float(hint)
                except ValueError:
                    try:
                        seconds = (parsedate_to_datetime(hint) - datetime.now(timezone.utc)).total_seconds()
                    except (ValueError, TypeError, OverflowError):
                        seconds = 0
                if math.isfinite(seconds):
                    delay = max(delay, seconds)
            if (not retryable or state is None or state['unsafe']
                    or attempt >= MAX_PROVIDER_ATTEMPTS - 1
                    or waited + delay > MAX_RETRY_WAIT_SECONDS
                    or time.monotonic() - started + delay > MAX_REQUEST_RETRY_SECONDS):
                log.warning('provider_attempt request=%s run=%s model=%s phase=final_failure attempt=%s status=%s', correlation, run_id, model, attempt + 1, status)
                return False
            log.info('provider_attempt request=%s run=%s model=%s phase=retry attempt=%s status=%s', correlation, run_id, model, attempt + 2, status)
            waited += delay
            await asyncio.sleep(delay)
            return True

        def recovered(attempt):
            if attempt:
                logging.getLogger('ady.chat').info('provider_attempt request=%s run=%s model=%s phase=recovered attempt=%s', correlation, run_id, model, attempt + 1)

        for attempt in range(MAX_PROVIDER_ATTEMPTS):
            if state is not None:
                state['error_kind'] = 'error'
            try:
                response = await self.inner.handle_async_request(request)
            except httpx.TimeoutException:
                if state is not None:
                    state['error_kind'] = 'timeout'
                if await retry(attempt):
                    continue
                raise httpx.ReadTimeout('Model provider timeout', request=request) from None
            except (httpx.NetworkError, httpx.RemoteProtocolError):
                if await retry(attempt):
                    continue
                raise httpx.ConnectError('Model provider connection failed', request=request) from None
            if response.status_code < 400:
                if 'text/event-stream' in response.headers.get('content-type', '').lower():
                    stream = SanitizedEventStream(response.stream, state)
                    try:
                        await stream.prime()
                    except httpx.TimeoutException:
                        await response.aclose()
                        if await retry(attempt):
                            continue
                        raise httpx.ReadTimeout('Model provider timeout', request=request) from None
                    except BaseException:
                        await response.aclose()
                        raise
                    if stream.error_code is not None:
                        await response.aclose()
                        code = stream.error_code
                        if await retry(attempt, code, response.headers, retryable=code == 429 or 500 <= code <= 599):
                            continue
                        return httpx.Response(code if 400 <= code <= 599 else 502, json={'error': {'message': 'Model provider request failed'}}, request=request)
                    recovered(attempt)
                    return httpx.Response(response.status_code, headers=response.headers, stream=stream, extensions=response.extensions, request=request)
                try:
                    streaming = json.loads(request.content).get('stream') is True
                except (ValueError, AttributeError):
                    streaming = True
                if streaming:
                    await response.aclose()
                    return httpx.Response(502, json={'error': {'message': 'Model provider request failed'}}, request=request)
                try:
                    body = await response.aread()
                    payload = json.loads(body)
                except (ValueError, UnicodeDecodeError, httpx.HTTPError):
                    payload = None
                await response.aclose()
                if not isinstance(payload, dict) or 'error' in payload or not isinstance(payload.get('choices'), list):
                    return httpx.Response(200, json={'error': {'message': 'Model provider request failed'}}, request=request)
                recovered(attempt)
                return httpx.Response(200, json=payload, request=request)
            status = response.status_code
            if state is not None:
                state['error_kind'] = 'auth' if status in (401, 403) else 'error'
            await response.aclose()
            if await retry(attempt, status, response.headers, retryable=status == 429 or 500 <= status <= 599):
                continue
            return httpx.Response(status, json={'error': {'message': 'Model provider request failed'}}, request=request)

    async def aclose(self):
        await self.inner.aclose()


def create_budgeted_http_client(
    *,
    max_tokens: int = MAX_MODEL_REQUEST_TOKENS,
    response_reserve: int = MODEL_RESPONSE_RESERVE_TOKENS,
    counter: Callable[[str], int] | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> httpx.AsyncClient:
    """Build an HTTPX client that blocks oversized chat requests before transport."""
    if max_tokens < 1 or response_reserve < 0:
        raise ValueError('Invalid model request budget')

    async def guard_request(request: httpx.Request) -> None:
        if request.method.upper() != 'POST' or not request.url.path.endswith('/chat/completions'):
            return
        body = await request.aread()
        try:
            if estimate_request_tokens(body, counter=counter, response_reserve=response_reserve) >= max_tokens:
                raise ModelRequestBudgetExceeded('A conversa excede o limite seguro de contexto do modelo.')
        except ModelRequestBudgetExceeded:
            state = _retry_state.get()
            if state is not None:
                state['error_kind'] = 'budget'
            raise

    return httpx.AsyncClient(
        timeout=60,
        transport=SafeProviderTransport(transport or httpx.AsyncHTTPTransport()),
        event_hooks={'request': [guard_request]},
    )
