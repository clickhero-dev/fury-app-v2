"""Opt-in fallback preserves context, capabilities and one bounded retry budget."""
import asyncio
import json

import httpx
import pytest

import model_request_budget as budget

URL = 'https://openrouter.ai/api/v1/chat/completions'


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv('CHAT_FALLBACK_MODELS', 'vendor/backup,vendor/last')
    monkeypatch.setenv('CHAT_FALLBACK_CAPABILITIES', json.dumps({
        model: {'supported_parameters': ['temperature', 'tools', 'tool_choice', 'max_tokens'], 'vision': True}
        for model in ('vendor/backup', 'vendor/last')
    }))
    async def sleep(delay):
        pass
    monkeypatch.setattr(budget.asyncio, 'sleep', sleep)


def test_fallback_preserves_payload_and_global_attempt_limit(configured):
    async def run():
        sent = []
        def handler(request):
            sent.append(json.loads(request.content))
            return httpx.Response(503)
        body = {'model': 'vendor/main', 'messages': [{'role': 'user', 'content': 'private'}],
                'tools': [{'type': 'function', 'function': {'name': 'inspect'}}], 'temperature': 0.2}
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope():
                assert (await client.post(URL, json=body)).status_code == 503
        assert [p['model'] for p in sent] == ['vendor/main', 'vendor/backup', 'vendor/last']
        assert all({**p, 'model': body['model']} == body for p in sent)
    asyncio.run(run())


@pytest.mark.parametrize('status,unsafe,scope', [(400, False, True), (401, False, True),
                                               (403, False, True), (503, True, True),
                                               (503, False, False)])
def test_no_fallback_for_unsafe_or_nontransient(configured, status, unsafe, scope):
    from contextlib import nullcontext
    async def run():
        sent = []
        def handler(request):
            sent.append(json.loads(request.content)['model'])
            return httpx.Response(status)
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope() if scope else nullcontext():
                if unsafe:
                    budget.mark_provider_output()
                await client.post(URL, json={'model': 'vendor/main'})
        assert sent == ['vendor/main']
    asyncio.run(run())


def test_each_fallback_is_guarded_with_its_own_token_estimate(configured):
    async def run():
        sent = []
        def handler(request):
            sent.append(json.loads(request.content)['model'])
            return httpx.Response(503)
        async with budget.create_budgeted_http_client(
            max_tokens=200, response_reserve=0, counter=lambda text: 1,
            transport=httpx.MockTransport(handler),
        ) as client:
            with budget.provider_retry_scope() as state:
                with pytest.raises(budget.ModelRequestBudgetExceeded):
                    await client.post(URL, json={'model': budget.DEEPSEEK_V4_MODEL,
                                                  'messages': [{'role': 'user', 'content': 'x' * 300}]})
                assert state['error_kind'] == 'budget'
        assert sent == [budget.DEEPSEEK_V4_MODEL]
    asyncio.run(run())


@pytest.mark.parametrize('extra', [{'reasoning': {'effort': 'high'}},
                                  {'messages': [{'role': 'user', 'content': [
                                      {'type': 'image_url', 'image_url': {'url': 'synthetic'}}]}]}])
def test_unhomologated_capabilities_do_not_change_models(configured, monkeypatch, extra):
    monkeypatch.setenv('CHAT_FALLBACK_CAPABILITIES', json.dumps({
        'vendor/backup': {'supported_parameters': []},
        'vendor/last': {'supported_parameters': []},
    }))
    async def run():
        sent = []
        def handler(request):
            sent.append(json.loads(request.content)['model'])
            return httpx.Response(503)
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope():
                await client.post(URL, json={'model': 'vendor/main', **extra})
        assert sent == ['vendor/main'] * 3
    asyncio.run(run())


def test_real_agno_fallback_before_output_and_selected_metadata(configured, capfd):
    from agno.agent import Agent
    from agno.models.openrouter import OpenRouter
    async def run():
        sent = []
        def handler(request):
            sent.append(json.loads(request.content))
            if len(sent) == 1:
                return httpx.Response(429, json={'error': {'message': 'private-provider-secret'}})
            return httpx.Response(200, headers={'content-type': 'text/event-stream'}, content=(
                'data: {"id":"1","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n'
                'data: [DONE]\n\n'))
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent = Agent(model=OpenRouter(id='vendor/main', api_key='synthetic',
                          http_client=client, max_retries=0, retries=0), telemetry=False)
            with budget.provider_retry_scope() as state:
                events = [e async for e in agent.arun('context synthetic', stream=True)]
                assert state['selected_model'] == 'vendor/backup'
                assert state['fallback_used'] is True
        assert [p['model'] for p in sent] == ['vendor/main', 'vendor/backup']
        assert {**sent[1], 'model': 'vendor/main'} == sent[0]
        assert any(getattr(e, 'content', None) == 'ok' for e in events)
    asyncio.run(run())
    captured = capfd.readouterr()
    assert 'private-provider-secret' not in captured.out + captured.err


@pytest.mark.parametrize('raw', ['["vendor/a","vendor/a","vendor/b"]', 'vendor/a, vendor/a,vendor/b'])
def test_policy_parsing_dedupes(raw):
    from provider_policy import ProviderPolicy
    policy = ProviderPolicy.from_env({'CHAT_FALLBACK_MODELS': raw})
    assert policy.models == ('vendor/a', 'vendor/b')


@pytest.mark.parametrize('raw', ['{bad', '["bad id"]', '["missing-provider"]', '[1]',
                                  ',vendor/a', ','.join(f'vendor/{i}' for i in range(9))])
def test_invalid_configuration_is_rejected_without_echo(raw):
    from provider_policy import ProviderPolicy
    with pytest.raises(ValueError) as error:
        ProviderPolicy.from_env({'CHAT_FALLBACK_MODELS': raw})
    assert raw not in str(error.value)


def test_default_policy_has_no_automatic_fallback():
    from provider_policy import ProviderPolicy
    assert ProviderPolicy.from_env({}).models == ()


@pytest.mark.parametrize('raw', ['[]', '{"vendor/backup":{}}',
                                  '{"vendor/backup":{"supported_parameters":"tools"}}',
                                  '{"vendor/backup":{"supported_parameters":[],"vision":"yes"}}',
                                  '{"vendor/backup":{"supported_parameters":[],"unknown":true}}'])
def test_invalid_capability_config_fails_closed(raw):
    from provider_policy import ProviderPolicy
    with pytest.raises(ValueError, match='Invalid chat fallback configuration'):
        ProviderPolicy.from_env({'CHAT_FALLBACK_CAPABILITIES': raw})


@pytest.mark.parametrize('failure', ['timeout', 'connection', 'sse', 'read'])
def test_transient_failure_classes_can_select_fallback(configured, failure):
    async def run():
        sent = []
        def handler(request):
            sent.append(json.loads(request.content)['model'])
            if len(sent) == 1:
                if failure == 'timeout':
                    raise httpx.ReadTimeout('private', request=request)
                if failure == 'connection':
                    raise httpx.ConnectError('private', request=request)
                if failure == 'read':
                    class Broken(httpx.AsyncByteStream):
                        async def __aiter__(self):
                            raise httpx.ReadError('private')
                            yield b''
                    return httpx.Response(200, headers={'content-type': 'text/event-stream'},
                                          stream=Broken())
                return httpx.Response(200, headers={'content-type': 'text/event-stream'},
                                      content='data: {"error":{"code":503}}\n\n')
            return httpx.Response(200, headers={'content-type': 'text/event-stream'},
                                  content='data: [DONE]\n\n')
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope():
                await client.post(URL, json={'model': 'vendor/main', 'stream': True})
        assert sent == ['vendor/main', 'vendor/backup']
    asyncio.run(run())


@pytest.mark.parametrize('hint', ['2', '120'])
def test_fallback_respects_retry_after_budget(configured, monkeypatch, hint):
    async def run():
        sent, delays = [], []
        async def sleep(delay):
            delays.append(delay)
        monkeypatch.setattr(budget.asyncio, 'sleep', sleep)
        def handler(request):
            sent.append(json.loads(request.content)['model'])
            return httpx.Response(429 if len(sent) == 1 else 200,
                                  headers={'Retry-After': hint}, json={'choices': []})
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope():
                await client.post(URL, json={'model': 'vendor/main'})
        assert sent == (['vendor/main', 'vendor/backup'] if hint == '2' else ['vendor/main'])
        assert delays == ([2] if hint == '2' else [])
    asyncio.run(run())


def test_fallback_respects_elapsed_deadline(configured, monkeypatch):
    async def run():
        sent = []
        def handler(request):
            sent.append(1)
            monkeypatch.setattr(budget.time, 'monotonic', lambda: 201)
            return httpx.Response(503)
        monkeypatch.setattr(budget.time, 'monotonic', lambda: 0)
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope():
                await client.post(URL, json={'model': 'vendor/main'})
        assert sent == [1]
    asyncio.run(run())


def test_real_agno_fallback_does_not_replay_tool_effect(configured):
    from agno.agent import Agent
    from agno.models.openrouter import OpenRouter
    async def run():
        sent, effects = [], []
        async def inspect():
            """Record one synthetic effect."""
            effects.append(1)
            return 'done'
        async def hook(function, args):
            budget.mark_provider_output()
            return await function(**args)
        def handler(request):
            sent.append(json.loads(request.content))
            if len(sent) != 2:
                return httpx.Response(503)
            choice = {'index': 0, 'delta': {'tool_calls': [
                {'index': 0, 'id': 't1', 'type': 'function',
                 'function': {'name': 'inspect', 'arguments': '{}'}}]}, 'finish_reason': 'tool_calls'}
            return httpx.Response(200, headers={'content-type': 'text/event-stream'},
                                  content='data: ' + json.dumps({'id': '1', 'choices': [choice]}) +
                                  '\n\ndata: [DONE]\n\n')
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent = Agent(model=OpenRouter(id='vendor/main', api_key='synthetic', http_client=client,
                          max_retries=0, retries=0), tools=[inspect], tool_hooks=[hook], telemetry=False)
            with budget.provider_retry_scope():
                events = [e async for e in agent.arun('synthetic', stream=True)]
        assert effects == [1]
        assert [p['model'] for p in sent] == ['vendor/main', 'vendor/backup', 'vendor/main']
        assert any(e.event == 'RunError' for e in events)
    asyncio.run(run())
