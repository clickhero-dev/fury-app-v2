"""Regressão: erros do provedor não podem expor payload no stream ou logs."""
import asyncio

import httpx

from agno.agent import Agent
from agno.models.openrouter import OpenRouter
from model_request_budget import create_budgeted_http_client


def test_provider_error_payload_is_not_exposed_to_stream_or_logs(capfd):
    secret = 'provider-private-prompt-and-secret'

    async def scenario():
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(503, json={'error': {'message': secret}})
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            model = OpenRouter(id='test', api_key='test', http_client=client, max_retries=0, retries=0)
            agent = Agent(model=model, telemetry=False)
            events = [event async for event in agent.arun('hello', stream=True)]
        assert len(calls) == 1
        return events

    events = asyncio.run(scenario())
    output = capfd.readouterr()
    assert secret not in output.out + output.err
    assert all(secret not in str(getattr(event, 'content', '')) for event in events)


def test_bounded_retry_only_for_transient_before_side_effects():
    from model_request_budget import provider_retry_scope, mark_provider_output
    async def run(status, mark=False):
        calls = []
        def handler(request):
            calls.append(1)
            return httpx.Response(status if len(calls) < 3 else 200, json={'error': {'message':'secret'}})
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with provider_retry_scope():
                if mark: mark_provider_output()
                response = await client.post('https://openrouter.ai/api/v1/chat/completions', json={'model':'x'})
        return len(calls), response.status_code
    assert asyncio.run(run(503)) == (3, 200)
    assert asyncio.run(run(429)) == (3, 200)
    assert asyncio.run(run(401)) == (1, 401)
    assert asyncio.run(run(503, True)) == (1, 503)


def test_runerror_is_never_forwarded_as_token():
    from streaming import checked_agent_events
    from types import SimpleNamespace
    async def events():
        yield SimpleNamespace(event='RunError', content='private-secret')
    async def run():
        return [item async for item in checked_agent_events(events())]
    import pytest
    with pytest.raises(Exception) as error:
        asyncio.run(run())
    assert 'private-secret' not in str(error.value)


def test_real_agno_retries_transient_then_streams_success(capfd):
    from model_request_budget import provider_retry_scope
    async def scenario():
        calls = []
        def handler(request):
            calls.append(1)
            if len(calls) < 3:
                return httpx.Response(503, json={'error': {'message': 'private-secret'}})
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, content='data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\ndata: [DONE]\n\n')
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent = Agent(model=OpenRouter(id='test', api_key='test', http_client=client, max_retries=0, retries=0), telemetry=False)
            with provider_retry_scope():
                events = [e async for e in agent.arun('hello', stream=True)]
        return calls, events
    calls, events = asyncio.run(scenario())
    assert len(calls) == 3
    assert any(getattr(e, 'content', None) == 'ok' for e in events)
    assert 'private-secret' not in str(events) + capfd.readouterr().err


def test_timeout_classification_survives_runerror():
    from model_request_budget import provider_retry_scope
    from streaming import checked_agent_events
    from telemetry import classify_provider_error
    from types import SimpleNamespace
    async def run():
        def handler(request): raise httpx.ReadTimeout('secret-url', request=request)
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with provider_retry_scope() as state:
                try: await client.post('https://example.invalid/chat/completions', json={'model':'x'})
                except httpx.TimeoutException: pass
                async def events(): yield SimpleNamespace(event='RunError', content='secret')
                try:
                    async for _ in checked_agent_events(events(), state): pass
                except Exception as error:
                    return classify_provider_error(error), str(error)
    kind, message = asyncio.run(run())
    assert kind == 'timeout'
    assert 'secret' not in message


def test_connection_error_is_sanitized_before_agno_logs(capfd):
    async def run():
        def handler(request): raise httpx.ConnectError('connection-secret', request=request)
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent = Agent(model=OpenRouter(id='test', api_key='test', http_client=client, max_retries=0, retries=0), telemetry=False)
            return [e async for e in agent.arun('hello', stream=True)]
    events = asyncio.run(run())
    captured = capfd.readouterr()
    assert 'connection-secret' not in captured.out + captured.err + str(events)


def test_streamed_provider_error_does_not_leak(capfd):
    async def run():
        def handler(request):
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, content='data: {"error":{"message":"stream-secret","code":503}}\n\ndata: [DONE]\n\n')
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent = Agent(model=OpenRouter(id='test', api_key='test', http_client=client, max_retries=0, retries=0), telemetry=False)
            return [e async for e in agent.arun('hello', stream=True)]
    events = asyncio.run(run())
    captured = capfd.readouterr()
    assert 'stream-secret' not in captured.out + captured.err + str(events)


def test_agno_tool_side_effect_prevents_retry_after_provider_failure():
    import json
    from model_request_budget import provider_retry_scope, mark_provider_output
    async def run():
        calls, effects = [], []
        def chunk(delta, reason=None):
            return 'data: ' + json.dumps({'id':'1','object':'chat.completion.chunk','choices':[{'index':0,'delta':delta,'finish_reason':reason}]}) + '\n\n'
        def handler(request):
            calls.append(1)
            if len(calls) > 1:
                return httpx.Response(503, json={'error': {'message':'secret'}})
            data = chunk({'role':'assistant'}) + chunk({'tool_calls':[{'index':0,'id':'t1','type':'function','function':{'name':'perform_action','arguments':'{}'}}]}) + chunk({}, 'tool_calls')
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, content=data+'data: [DONE]\n\n')
        async def perform_action():
            """Perform the action once."""
            effects.append(1)
            return 'done'
        async def hook(function, args):
            mark_provider_output()
            return await function(**args)
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent = Agent(model=OpenRouter(id='test', api_key='test', http_client=client, max_retries=0, retries=0), tools=[perform_action], tool_hooks=[hook], telemetry=False)
            with provider_retry_scope():
                events = [e async for e in agent.arun('act', stream=True)]
        assert len(calls) == 2
        assert effects == [1]
        assert any(getattr(e, 'event', None) == 'RunError' for e in events)
    asyncio.run(run())


def test_multiline_sse_error_is_sanitized_across_chunks():
    async def run():
        class Chunks(httpx.AsyncByteStream):
            async def __aiter__(self):
                for part in [b'data: {"error":\n', b'data: {"message":"multi-secret",', b'"code":401}}\n\n']:
                    yield part
        async with create_budgeted_http_client(transport=httpx.MockTransport(lambda r: httpx.Response(200, headers={'content-type':'text/event-stream'}, stream=Chunks()))) as client:
            response = await client.post('https://example.com/chat/completions', json={'model':'x','stream':True})
            return response.text
    assert 'multi-secret' not in asyncio.run(run())


def test_stream_request_rejects_non_sse_body():
    async def run():
        async with create_budgeted_http_client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={'error':{'message':'body-secret'}}))) as client:
            return await client.post('https://example.com/chat/completions', json={'model':'x','stream':True})
    response = asyncio.run(run())
    assert response.status_code >= 400
    assert 'body-secret' not in response.text


def test_stream_read_timeout_is_classified_and_retried():
    from model_request_budget import provider_retry_scope
    async def run():
        calls = []
        class Broken(httpx.AsyncByteStream):
            async def __aiter__(self):
                raise httpx.ReadTimeout('read-secret')
                yield b''
        def handler(r):
            calls.append(1)
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, stream=Broken())
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with provider_retry_scope() as state:
                try: await client.post('https://example.com/chat/completions', json={'model':'x','stream':True})
                except httpx.TimeoutException as exc: return len(calls), state['error_kind'], str(exc)
    calls, kind, message = asyncio.run(run())
    assert calls == 3 and kind == 'timeout' and 'read-secret' not in message


def test_transient_sse_error_retries_before_output():
    from model_request_budget import provider_retry_scope
    async def run():
        calls = []
        def handler(r):
            calls.append(1)
            body = 'data: {"error":{"message":"retry-secret","code":503}}\n\n' if len(calls) < 3 else 'data: [DONE]\n\n'
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, content=body)
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with provider_retry_scope():
                response = await client.post('https://example.com/chat/completions', json={'model':'x','stream':True})
                return len(calls), response.text
    calls, text = asyncio.run(run())
    assert calls == 3 and '[DONE]' in text and 'retry-secret' not in text


def test_budget_failure_survives_runerror():
    from model_request_budget import provider_retry_scope, ModelRequestBudgetExceeded
    from streaming import checked_agent_events
    from types import SimpleNamespace
    async def run():
        async with create_budgeted_http_client(max_tokens=1) as client:
            with provider_retry_scope() as state:
                try: await client.post('https://example.com/chat/completions', json={'model':'x'})
                except ModelRequestBudgetExceeded: pass
                async def events(): yield SimpleNamespace(event='RunError', content='hidden')
                return [e async for e in checked_agent_events(events(), state)]
    import pytest
    with pytest.raises(ModelRequestBudgetExceeded): asyncio.run(run())


def test_nonstream_200_error_is_sanitized():
    async def run():
        async with create_budgeted_http_client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={'error':{'message':'nonstream-secret'}}))) as client:
            return await client.post('https://example.com/chat/completions', json={'model':'x'})
    assert 'nonstream-secret' not in asyncio.run(run()).text


def test_sse_retry_is_disabled_after_side_effect():
    from model_request_budget import provider_retry_scope, mark_provider_output
    async def run():
        calls = []
        def handler(r):
            calls.append(1)
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, content='data: {"error":{"code":503,"message":"secret"}}\n\n')
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with provider_retry_scope():
                mark_provider_output()
                response = await client.post('https://example.com/chat/completions', json={'model':'x','stream':True})
                return len(calls), response.text
    calls, text = asyncio.run(run())
    assert calls == 1 and 'secret' not in text


def test_late_stream_timeout_is_safe_and_classified_without_retry():
    from model_request_budget import provider_retry_scope
    async def run():
        calls = []
        class Broken(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b'data: {"choices":[]}\n\n'
                raise httpx.ReadTimeout('late-secret')
        def handler(r):
            calls.append(1)
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, stream=Broken())
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with provider_retry_scope() as state:
                try: await client.post('https://example.com/chat/completions', json={'model':'x','stream':True})
                except httpx.TimeoutException as e: return len(calls), state['error_kind'], str(e)
    calls, kind, message = asyncio.run(run())
    assert calls == 1 and kind == 'timeout' and 'late-secret' not in message


def test_unknown_sse_payload_is_not_forwarded():
    async def run():
        async with create_budgeted_http_client(transport=httpx.MockTransport(lambda r: httpx.Response(200, headers={'content-type':'text/event-stream'}, content='data: {"message":"unknown-secret"}\n\n'))) as client:
            return (await client.post('https://example.com/chat/completions', json={'model':'x','stream':True})).text
    assert 'unknown-secret' not in asyncio.run(run())


def test_sse_keepalive_does_not_block_transient_retry():
    from model_request_budget import provider_retry_scope
    async def run():
        calls = []
        def handler(r):
            calls.append(1)
            data = ': heartbeat\n\ndata: {"error":{"code":503,"message":"secret"}}\n\n' if len(calls) == 1 else 'data: [DONE]\n\n'
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, content=data)
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with provider_retry_scope():
                response = await client.post('https://example.com/chat/completions', json={'model':'x','stream':True})
                return len(calls), response.text
    calls, text = asyncio.run(run())
    assert calls == 2 and '[DONE]' in text


def test_metadata_only_sse_block_does_not_hide_transient_error():
    from model_request_budget import provider_retry_scope
    async def run():
        calls = []
        def handler(request):
            calls.append(1)
            body = 'id: private-metadata\n\nevent: error\ndata: {"error":{"code":503,"message":"private-error"}}\n\n' if len(calls) == 1 else 'data: [DONE]\n\n'
            return httpx.Response(200, headers={'content-type': 'text/event-stream'}, content=body)
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with provider_retry_scope():
                response = await client.post('https://example.com/chat/completions', json={'model': 'x', 'stream': True})
                return len(calls), response.text
    calls, text = asyncio.run(run())
    assert calls == 2
    assert '[DONE]' in text and 'private' not in text


def test_prime_read_error_closes_response_and_sanitizes_exception():
    import pytest
    from model_request_budget import provider_retry_scope
    async def run():
        class Broken(httpx.AsyncByteStream):
            closed = False
            async def __aiter__(self):
                raise httpx.ReadError('private-read-error')
                yield b''
            async def aclose(self):
                self.closed = True
        stream = Broken()
        async with create_budgeted_http_client(transport=httpx.MockTransport(lambda request: httpx.Response(200, headers={'content-type': 'text/event-stream'}, stream=stream))) as client:
            with provider_retry_scope():
                with pytest.raises(httpx.ReadError) as exc:
                    await client.post('https://example.com/chat/completions', json={'model': 'x', 'stream': True})
        assert stream.closed
        assert 'private-read-error' not in str(exc.value)
    asyncio.run(run())


def test_successful_retry_clears_previous_timeout_classification():
    from model_request_budget import provider_retry_scope
    async def run():
        calls = []
        def handler(r):
            calls.append(1)
            if len(calls) == 1: raise httpx.ReadTimeout('timeout', request=r)
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, content='data: [DONE]\n\n')
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with provider_retry_scope() as state:
                await client.post('https://example.com/chat/completions', json={'model':'x','stream':True})
                return state['error_kind']
    assert asyncio.run(run()) == 'error'


def test_agno_retries_role_only_then_transient_error():
    import json
    from model_request_budget import provider_retry_scope
    async def run():
        calls = []
        def chunk(delta):
            return "data: " + json.dumps({"id":"1", "object":"chat.completion.chunk", "choices":[{"index":0, "delta":delta, "finish_reason":None}]}) + "\n\n"
        def handler(request):
            calls.append(1)
            body = chunk({"role":"assistant"}) + ('data: {"error":{"code":503,"message":"private"}}\n\n' if len(calls) == 1 else chunk({"content":"ok"}) + "data: [DONE]\n\n")
            return httpx.Response(200, headers={"content-type":"text/event-stream"}, content=body)
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent = Agent(model=OpenRouter(id="test", api_key="test", http_client=client, max_retries=0, retries=0), telemetry=False)
            with provider_retry_scope():
                events = [event async for event in agent.arun("hello", stream=True)]
        assert len(calls) == 2
        assert [e.content for e in events if getattr(e, "content", None) == "ok"] == ["ok"]
    asyncio.run(run())


def test_agno_retries_role_only_then_read_timeout_bounded():
    import json
    from model_request_budget import provider_retry_scope
    async def run():
        calls = []
        class Broken(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield ("data: " + json.dumps({"id":"1", "object":"chat.completion.chunk", "choices":[{"index":0, "delta":{"role":"assistant"}, "finish_reason":None}]}) + "\n\n").encode()
                raise httpx.ReadTimeout("private-timeout")
        def handler(request):
            calls.append(1)
            return httpx.Response(200, headers={"content-type":"text/event-stream"}, stream=Broken())
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent = Agent(model=OpenRouter(id="test", api_key="test", http_client=client, max_retries=0, retries=0), telemetry=False)
            with provider_retry_scope() as state:
                events = [e async for e in agent.arun("hello", stream=True)]
        assert len(calls) == 3
        assert state["error_kind"] == "timeout"
        assert any(e.event == "RunError" for e in events)
        assert "private-timeout" not in str(events)
    asyncio.run(run())


def test_agno_no_retry_after_visible_output_followed_by_error():
    import json
    from model_request_budget import provider_retry_scope
    async def run():
        calls = []
        def handler(request):
            calls.append(1)
            def chunk(delta):
                return "data: " + json.dumps({"id":"1", "object":"chat.completion.chunk", "choices":[{"index":0, "delta":delta, "finish_reason":None}]}) + "\n\n"
            body = chunk({"role":"assistant"}) + chunk({"content":"visible"}) + 'data: {"error":{"code":503,"message":"private"}}\n\n'
            return httpx.Response(200, headers={"content-type":"text/event-stream"}, content=body)
        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent = Agent(model=OpenRouter(id="test", api_key="test", http_client=client, max_retries=0, retries=0), telemetry=False)
            with provider_retry_scope():
                events = [e async for e in agent.arun("hello", stream=True)]
        assert len(calls) == 1
        assert [e.content for e in events if getattr(e, "content", None) == "visible"] == ["visible"]
        assert any(e.event == "RunError" for e in events)
    asyncio.run(run())
