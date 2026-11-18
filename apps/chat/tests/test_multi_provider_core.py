import asyncio
import json

import httpx
import pytest

from multi_provider_core import stream_agent, ProviderFailure

ENV = {'OPENAI_API_KEY': 'openai-test', 'ANTHROPIC_API_KEY': 'anthropic-test', 'OPENROUTER_API_KEY': 'router-test'}


def run(coro):
    return asyncio.run(coro)


def openai_stream(content='ok'):
    chunk = {'id':'x','object':'chat.completion.chunk','created':1,'model':'x','choices':[{'index':0,'delta':{'content':content},'finish_reason':None}]}
    return httpx.Response(200, headers={'content-type':'text/event-stream'}, content='data: '+json.dumps(chunk)+'\n\ndata: [DONE]\n\n')


def test_real_agno_fallback_order_and_context():
    async def scenario():
        requests=[]
        def handler(request):
            requests.append(request)
            if len(requests) < 3:
                return httpx.Response(503, json={'error':{'message':'secret'}})
            return openai_stream()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            events = [e async for e in stream_agent('private context', env=ENV, http_client=client)]
        assert [r.url.host for r in requests] == ['api.openai.com','api.anthropic.com','openrouter.ai']
        assert [json.loads(r.content)['model'] for r in requests] == ['gpt-6-luna','claude-sonnet-5-5','google/gemini-3.8-flash']
        assert all('private context' in r.content.decode() for r in requests)
        assert any(getattr(e, 'content', None) == 'ok' for e in events)
        assert requests[0].headers['authorization'] == 'Bearer openai-test'
        assert requests[1].headers['x-api-key'] == 'anthropic-test'
        assert requests[2].headers['authorization'] == 'Bearer router-test'
    run(scenario())


@pytest.mark.parametrize('status,expected', [(400,'invalid'),(401,'auth'),(403,'auth'),(429,'transient'),(503,'transient')])
def test_error_classification_and_redaction(status, expected, capfd):
    async def scenario():
        calls=[]
        def handler(request):
            calls.append(request)
            return httpx.Response(status, json={'error': {'message':'super-secret-content'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(ProviderFailure) as error:
                _ = [e async for e in stream_agent('private', env=ENV, http_client=client)]
        assert error.value.kind == expected
        assert len(calls) == (1 if status == 400 else 3)
        assert 'super-secret-content' not in str(error.value)
    run(scenario())
    assert 'super-secret-content' not in ''.join(capfd.readouterr())


def test_missing_keys_and_empty_config():
    async def scenario():
        calls=[]
        def handler(request):
            calls.append(request.url.host)
            return openai_stream()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert [e async for e in stream_agent('hello', env={'OPENROUTER_API_KEY':'test'}, http_client=client)]
            with pytest.raises(ProviderFailure) as err:
                _ = [e async for e in stream_agent('hello', env={}, http_client=client)]
        assert calls == ['openrouter.ai']
        assert err.value.kind == 'configuration'
    run(scenario())


@pytest.mark.parametrize('env,host', [
    (ENV, 'api.openai.com'),
    ({'OPENROUTER_API_KEY': 'router-test'}, 'openrouter.ai'),
])
def test_tool_effect_is_never_replayed_after_provider_failure(env, host):
    async def scenario():
        requests=[]; effects=[]
        async def action():
            """Do a synthetic effect."""
            effects.append(1)
            return 'done'
        def handler(request):
            requests.append(request)
            if len(requests)>1:
                return httpx.Response(503, json={'error': {'message':'secret'}})
            delta={'tool_calls':[{'index':0,'id':'c1','type':'function','function':{'name':'action','arguments':'{}'}}]}
            chunk={'id':'x','object':'chat.completion.chunk','created':1,'model':'x','choices':[{'index':0,'delta':delta,'finish_reason':'tool_calls'}]}
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, content='data: '+json.dumps(chunk)+'\n\ndata: [DONE]\n\n')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(ProviderFailure):
                _ = [e async for e in stream_agent('hello', env=env, http_client=client, agent_options={'tools':[action]})]
        assert effects == [1]
        assert len(requests) == 2
        assert all(r.url.host == host for r in requests)
    run(scenario())


def test_output_blocks_fallback():
    async def scenario():
        calls=[]
        class Broken(httpx.AsyncByteStream):
            async def __aiter__(self):
                chunk={'id':'x','object':'chat.completion.chunk','created':1,'model':'x','choices':[{'index':0,'delta':{'content':'partial'},'finish_reason':None}]}
                yield ('data: '+json.dumps(chunk)+'\n\n').encode()
                raise httpx.ReadError('private')
        def handler(request):
            calls.append(1)
            return httpx.Response(200, headers={'content-type':'text/event-stream'},stream=Broken())
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(ProviderFailure):
                _ = [e async for e in stream_agent('hello',env=ENV,http_client=client)]
        assert calls == [1]
    run(scenario())


def test_sse_provider_error_is_redacted_and_falls_back(capfd):
    async def scenario():
        calls=[]
        def handler(request):
            calls.append(request)
            if len(calls) == 1:
                return httpx.Response(200,headers={'content-type':'text/event-stream'},content='data: {"error":{"code":503,"message":"secret-sse-value"}}\n\n')
            return httpx.Response(503)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(ProviderFailure) as err:
                _ = [e async for e in stream_agent('hello',env=ENV,http_client=client)]
        assert err.value.kind == 'transient'
        assert len(calls) == 3
    run(scenario())
    assert 'secret-sse-value' not in ''.join(capfd.readouterr())


def test_incomplete_empty_stream_is_not_success():
    async def scenario():
        calls=[]
        def handler(request):
            calls.append(1)
            return httpx.Response(200,headers={'content-type':'text/event-stream'},content=': keepalive\n\n')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(ProviderFailure):
                _ = [e async for e in stream_agent('hello',env=ENV,http_client=client)]
        assert len(calls) == 3
    run(scenario())


def test_anthropic_real_stream_and_usage():
    async def scenario():
        def handler(request):
            def event(name, data):
                return 'event: '+name+'\ndata: '+json.dumps(data)+'\n\n'
            text = event('message_start', {'type':'message_start','message':{'id':'m1','type':'message','role':'assistant','model':'claude-sonnet-5-5','content':[],'stop_reason':None,'usage':{'input_tokens':7,'output_tokens':0}}})
            text += event('content_block_start', {'type':'content_block_start','index':0,'content_block':{'type':'text','text':''}})
            text += event('content_block_delta', {'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':'olá'}})
            text += event('content_block_stop', {'type':'content_block_stop','index':0})
            text += event('message_delta', {'type':'message_delta','delta':{'stop_reason':'end_turn','stop_sequence':None},'usage':{'output_tokens':3}})
            text += event('message_stop', {'type':'message_stop'})
            return httpx.Response(200,headers={'content-type':'text/event-stream'},content=text)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            events = [e async for e in stream_agent('context',env={'ANTHROPIC_API_KEY':'test'},http_client=client)]
        assert any(getattr(e,'content',None) == 'olá' for e in events)
    run(scenario())


def test_anthropic_tool_effect_never_replayed_on_followup_failure():
    async def scenario():
        calls, effects = [], []
        async def action():
            """Record one effect."""
            effects.append(1)
            return 'done'
        def event(name, data):
            return 'event: ' + name + '\ndata: ' + json.dumps(data) + '\n\n'
        def handler(request):
            calls.append(request.url.host)
            if len(calls) == 1:
                return httpx.Response(503)
            if len(calls) > 2:
                return httpx.Response(503)
            body = event('message_start', {'type':'message_start','message':{
                'id':'m1','type':'message','role':'assistant','model':'claude-sonnet-5-5',
                'content':[],'stop_reason':None,'usage':{'input_tokens':7,'output_tokens':0}}})
            body += event('content_block_start', {'type':'content_block_start','index':0,
                'content_block':{'type':'tool_use','id':'t1','name':'action','input':{}}})
            body += event('content_block_delta', {'type':'content_block_delta','index':0,
                'delta':{'type':'input_json_delta','partial_json':'{}'}})
            body += event('content_block_stop', {'type':'content_block_stop','index':0})
            body += event('message_delta', {'type':'message_delta','delta':{
                'stop_reason':'tool_use','stop_sequence':None},'usage':{'output_tokens':3}})
            body += event('message_stop', {'type':'message_stop'})
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, content=body)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(ProviderFailure):
                _ = [e async for e in stream_agent('act', env=ENV, http_client=client,
                                                  agent_options={'tools': [action]})]
        assert calls == ['api.openai.com', 'api.anthropic.com', 'api.anthropic.com']
        assert effects == [1]
    run(scenario())


def test_sync_tool_can_run_once():
    async def scenario():
        effects=[]; calls=[]
        def action():
            """A synchronous synthetic tool."""
            effects.append(1)
            return 'ok'
        def handler(request):
            calls.append(1)
            if len(calls) == 1:
                delta={'tool_calls':[{'index':0,'id':'c1','type':'function','function':{'name':'action','arguments':'{}'}}]}
                chunk={'id':'x','object':'chat.completion.chunk','created':1,'model':'x','choices':[{'index':0,'delta':delta,'finish_reason':'tool_calls'}]}
                return httpx.Response(200,headers={'content-type':'text/event-stream'},content='data: '+json.dumps(chunk)+'\n\ndata: [DONE]\n\n')
            return openai_stream('done')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            events=[e async for e in stream_agent('hello',env=ENV,http_client=client,agent_options={'tools':[action]})]
        assert effects == [1]
        assert any(getattr(e,'content',None) == 'done' for e in events)
    run(scenario())


def test_partial_tool_call_disables_fallback_before_hook():
    async def scenario():
        calls=[]
        class Broken(httpx.AsyncByteStream):
            async def __aiter__(self):
                payload={'id':'x','choices':[{'index':0,'delta':{'tool_calls':[{'index':0,'id':'c1','type':'function','function':{'name':'action','arguments':''}}]},'finish_reason':None}]}
                yield ('data: '+json.dumps(payload)+'\n\n').encode()
                raise httpx.ReadError('private')
        def handler(request):
            calls.append(1)
            return httpx.Response(200,headers={'content-type':'text/event-stream'},stream=Broken())
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(ProviderFailure):
                _ = [e async for e in stream_agent('hello',env=ENV,http_client=client)]
        assert calls == [1]
    run(scenario())


def test_agent_retries_cannot_be_enabled():
    async def scenario():
        with pytest.raises(ProviderFailure) as err:
            _ = [e async for e in stream_agent('hello',env=ENV,agent_options={'retries':1})]
        assert err.value.kind == 'configuration'
    run(scenario())


def test_every_physical_provider_request_is_durably_charged():
    from model_request_budget import durable_budget_scope

    async def scenario():
        charges, calls = [], []
        async def charge(tokens):
            charges.append(tokens)
        def handler(request):
            calls.append(request)
            return httpx.Response(503) if len(calls) < 3 else openai_stream()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with durable_budget_scope(charge):
                _ = [event async for event in stream_agent('hello', env=ENV, http_client=client)]
        assert len(charges) == len(calls) == 3
        assert all(tokens > 4096 for tokens in charges)
    run(scenario())


def test_collect_text_uses_same_fallback_and_discards_partial_failure():
    from multi_provider_core import collect_text

    async def scenario():
        calls = []
        def handler(request):
            calls.append(request.url.host)
            return httpx.Response(503) if len(calls) == 1 else openai_stream('Título')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            text = await collect_text('context', env={
                'OPENAI_API_KEY': 'test', 'OPENROUTER_API_KEY': 'test',
            }, http_client=client, instructions=['Gere título'])
        assert text == 'Título'
        assert calls == ['api.openai.com', 'openrouter.ai']
    run(scenario())


def test_real_agno_runs_guard_and_never_replays_failed_proposal():
    from checkpoint_tools import ToolGuard

    async def scenario():
        effects, calls = [], []
        async def propose_instagram_post():
            """Create a proposal."""
            effects.append(1)
            raise RuntimeError('private database failure')
        guard = ToolGuard(None)
        async def guarded_tool(function, args, function_name=None):
            return await guard(function, args, function_name=function_name)
        def handler(request):
            calls.append(request.url.host)
            if len(calls) == 1:
                delta = {'tool_calls': [{'index': 0, 'id': 'c1', 'type': 'function',
                    'function': {'name': 'propose_instagram_post', 'arguments': '{}'}}]}
                chunk = {'id': 'x', 'object': 'chat.completion.chunk', 'created': 1, 'model': 'x',
                         'choices': [{'index': 0, 'delta': delta, 'finish_reason': 'tool_calls'}]}
                return httpx.Response(200, headers={'content-type': 'text/event-stream'},
                    content='data: ' + json.dumps(chunk) + '\n\ndata: [DONE]\n\n')
            return httpx.Response(503)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(ProviderFailure):
                _ = [e async for e in stream_agent('hello', env=ENV, http_client=client,
                    agent_options={'tools': [propose_instagram_post], 'tool_hooks': [guarded_tool]})]
        assert effects == [1]
        assert guard.failed
        assert all(host == 'api.openai.com' for host in calls)
    run(scenario())


def test_budget_rejection_is_not_misclassified_as_provider_or_sent():
    from model_request_budget import ModelRequestBudgetExceeded, durable_budget_scope
    async def scenario():
        calls = []
        async def reject(_tokens):
            raise ModelRequestBudgetExceeded('budget')
        async with httpx.AsyncClient(transport=httpx.MockTransport(
                lambda request: calls.append(request) or openai_stream())) as client:
            with durable_budget_scope(reject), pytest.raises(ModelRequestBudgetExceeded):
                _ = [e async for e in stream_agent('hello', env=ENV, http_client=client)]
        assert not calls
    run(scenario())


def test_provider_failure_identifies_last_provider_without_private_data():
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(503))) as client:
            with pytest.raises(ProviderFailure) as error:
                _ = [event async for event in stream_agent('private', env=ENV, http_client=client)]
        assert error.value.provider == 'openrouter'
        assert 'private' not in str(error.value)
    run(scenario())


def test_budget_database_failure_is_not_sent_or_reported_as_provider(capfd):
    from model_request_budget import durable_budget_scope
    from multi_provider_core import PersistenceAdmissionFailure
    async def scenario():
        calls = []
        async def fail(_tokens):
            raise RuntimeError('private database password')
        async with httpx.AsyncClient(transport=httpx.MockTransport(
                lambda request: calls.append(request) or openai_stream())) as client:
            with durable_budget_scope(fail), pytest.raises(PersistenceAdmissionFailure):
                _ = [event async for event in stream_agent('hello', env=ENV, http_client=client)]
        assert calls == []
    run(scenario())
    assert 'private database password' not in ''.join(capfd.readouterr())


def test_provider_fallback_diagnostics_are_sanitized(caplog):
    async def scenario():
        calls = []
        def handler(request):
            calls.append(1)
            return (httpx.Response(503, json={'error': {'message': 'private-provider-detail'}})
                    if len(calls) == 1 else openai_stream('ok'))
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            _ = [event async for event in stream_agent('private-prompt', env={
                'OPENAI_API_KEY':'private-key', 'OPENROUTER_API_KEY':'another-key'
            }, http_client=client)]
    run(scenario())
    assert 'provider=openai' in caplog.text and 'phase=fallback' in caplog.text
    assert 'private-provider-detail' not in caplog.text
    assert 'private-prompt' not in caplog.text
    assert 'private-key' not in caplog.text


def test_compressed_anthropic_sse_is_decoded_once():
    import gzip
    async def scenario():
        def event(name, data):
            return 'event: '+name+'\ndata: '+json.dumps(data)+'\n\n'
        body = event('message_start', {'type':'message_start','message':{
            'id':'m1','type':'message','role':'assistant','model':'claude-sonnet-5-5','content':[],
            'stop_reason':None,'usage':{'input_tokens':7,'output_tokens':0}}})
        body += event('content_block_start', {'type':'content_block_start','index':0,'content_block':{'type':'text','text':''}})
        body += event('content_block_delta', {'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':'ok'}})
        body += event('content_block_stop', {'type':'content_block_stop','index':0})
        body += event('message_delta', {'type':'message_delta','delta':{'stop_reason':'end_turn','stop_sequence':None},'usage':{'output_tokens':3}})
        body += event('message_stop', {'type':'message_stop'})
        class Compressed(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield gzip.compress(body.encode())
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(
                200, headers={'content-type':'text/event-stream','content-encoding':'gzip'},
                stream=Compressed()))) as client:
            events = [e async for e in stream_agent('hello', env={'ANTHROPIC_API_KEY':'test'}, http_client=client)]
        assert any(getattr(e,'content',None) == 'ok' for e in events)
    run(scenario())


def test_openai_luna_tool_request_sets_supported_reasoning_effort():
    async def scenario():
        payloads = []
        async def action():
            """A synthetic tool."""
            return 'done'
        def handler(request):
            payloads.append(json.loads(request.content))
            return openai_stream()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            _ = [e async for e in stream_agent('hello', env={'OPENAI_API_KEY':'test'},
                http_client=client, agent_options={'tools':[action]})]
        assert payloads[0]['reasoning_effort'] == 'none'
        assert payloads[0]['tools']
    run(scenario())
