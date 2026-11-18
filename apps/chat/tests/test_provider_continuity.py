"""Funcionalidade: continuidade segura do provedor
Dado um turno com contexto e ferramentas já protegidos pelo fencing
Quando o provedor desconecta, limita ou encerra um stream incompleto
Então retenta somente antes de saída, respeita prazo e falha visivelmente sem repetir ações.
"""
import asyncio
import json
import httpx
import pytest
import model_request_budget as budget

URL = 'https://openrouter.ai/api/v1/chat/completions'

@pytest.mark.parametrize('failure', ['connection', 'timeout', 429, 503, 400, 401, 403])
def test_transient_policy_and_retry_after(failure, monkeypatch):
    async def run():
        attempts, sleeps = [], []
        async def sleep(delay): sleeps.append(delay)
        monkeypatch.setattr(budget.asyncio, 'sleep', sleep)
        async def handler(request):
            attempts.append(request.content)
            if len(attempts) == 1:
                if failure == 'connection': raise httpx.ConnectError('secret', request=request)
                if failure == 'timeout': raise httpx.ReadTimeout('secret', request=request)
                return httpx.Response(failure, headers={'Retry-After': '2'}, json={'error':'secret'})
            return httpx.Response(200, json={'choices':[]})
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope():
                result = await client.post(URL, json={'messages':[]})
        transient = failure in ('connection', 'timeout', 429, 503)
        assert len(attempts) == (2 if transient else 1)
        assert result.status_code == (200 if transient else failure)
        if failure in (429, 503): assert sleeps == [2]
        assert all(body == attempts[0] for body in attempts)
    asyncio.run(run())

@pytest.mark.parametrize('unsafe', [False, True])
def test_retry_limit_and_no_replay_after_output(unsafe, monkeypatch):
    async def run():
        calls=[]
        async def sleep(delay): pass
        monkeypatch.setattr(budget.asyncio, 'sleep', sleep)
        async def handler(request):
            calls.append(1)
            return httpx.Response(503)
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope():
                if unsafe: budget.mark_provider_output()
                response=await client.post(URL, json={})
        assert response.status_code == 503
        assert len(calls) == (1 if unsafe else 3)
    asyncio.run(run())

@pytest.mark.parametrize('ending', ['eof', 'error', 'length', 'content_filter', 'done', 'stop'])
def test_stream_must_complete(ending):
    async def run():
        class Stream(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b'data: {"choices":[{"delta":{"content":"Vou levantar"}}]}\n\n'
                if ending == 'done': yield b'data: [DONE]\n\n'
                if ending in ('error','length','content_filter','stop'):
                    yield ('data: '+json.dumps({'choices':[{'delta':{},'finish_reason':ending}]})+'\n\n').encode()
        async def handler(request): return httpx.Response(200, headers={'content-type':'text/event-stream'}, stream=Stream())
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope():
                if ending in ('eof','error','length','content_filter'):
                    with pytest.raises(httpx.ReadError, match='Model provider'):
                        await client.post(URL,json={'stream':True})
                else: assert (await client.post(URL,json={'stream':True})).status_code == 200
    asyncio.run(run())

def test_retry_after_exceeding_budget_does_not_retry(monkeypatch):
    async def run():
        calls=[]
        async def handler(request):
            calls.append(1)
            return httpx.Response(429,headers={'Retry-After':'120'})
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope():
                assert (await client.post(URL,json={})).status_code == 429
        assert len(calls) == 1
    asyncio.run(run())

# Cenário: ferramenta ou stream permanece ativo sem concluir
# Quando o prazo total vence, Então o chamador recebe timeout e pode marcar o run failed.
def test_agent_deadline_and_cancellation():
    from streaming import checked_agent_events
    async def run():
        closed=[]
        async def hanging():
            try:
                yield 'partial'
                await asyncio.Event().wait()
            finally: closed.append(True)
        with pytest.raises(TimeoutError):
            async for _ in checked_agent_events(hanging(), timeout=0.01): pass
        assert closed == [True]
    asyncio.run(run())

# Cenário: retry respeita data HTTP e ignora hints inválidos sem espera infinita
@pytest.mark.parametrize('hint', ['Wed, 01 Jan 2031 00:00:00 GMT', 'invalid', 'NaN', '-1'])
def test_retry_after_date_and_invalid_values(hint, monkeypatch):
    async def run():
        calls, delays=[], []
        async def sleep(delay): delays.append(delay)
        monkeypatch.setattr(budget.asyncio, 'sleep', sleep)
        async def handler(request):
            calls.append(1)
            return httpx.Response(503 if len(calls)==1 else 200, headers={'Retry-After':hint}, json={'choices':[]})
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            with budget.provider_retry_scope(): await client.post(URL,json={})
        assert len(calls) == (1 if hint.startswith('Wed') else 2)
        assert all(0.1 <= delay <= 0.2 for delay in delays)
    asyncio.run(run())

# Cenário: Agno real não considera a mensagem de intenção uma resposta completa
@pytest.mark.parametrize('ending', ['', 'data: {"choices":[{"delta":{},"finish_reason":"error"}]}\n\n'])
def test_agno_partial_response_never_completes(ending):
    from agno.agent import Agent
    from agno.models.openrouter import OpenRouter
    from streaming import checked_agent_events, ProviderRunError
    async def run():
        calls=[]
        async def handler(request):
            calls.append(1)
            body='data: {"id":"test","choices":[{"index":0,"delta":{"content":"Vou levantar"},"finish_reason":null}]}\n\n'+ending
            return httpx.Response(200,headers={'content-type':'text/event-stream'},content=body)
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent=Agent(model=OpenRouter(id='test',api_key='synthetic',http_client=client,max_retries=0,retries=0),telemetry=False)
            with budget.provider_retry_scope() as state:
                with pytest.raises(ProviderRunError):
                    async for event in checked_agent_events(agent.arun('contexto sintético',stream=True),state):
                        if getattr(event,'content',None): budget.mark_provider_output()
        assert len(calls)==1
    asyncio.run(run())

# Cenário: quarenta turnos anteriores e três consultas completam após falha inicial
# Então o histórico é preservado e cada consulta aparece uma vez e em ordem.
def test_long_context_multiple_tools_after_recovery(monkeypatch, caplog):
    from agno.agent import Agent
    from agno.models.openrouter import OpenRouter
    from streaming import checked_agent_events
    import logging
    caplog.set_level(logging.INFO, logger='ady.chat')
    async def run():
        requests, effects, output=[], [], []
        async def sleep(delay): pass
        monkeypatch.setattr(budget.asyncio,'sleep',sleep)
        async def inspect_step(step: int):
            """Consulta sintética somente leitura."""
            effects.append(step)
            return json.dumps({'step':step,'found':True})
        async def hook(function,args):
            budget.mark_provider_output()
            return await function(**args)
        def chunk(delta,finish=None):
            return 'data: '+json.dumps({'id':'mock','choices':[{'index':0,'delta':delta,'finish_reason':finish}]})+'\n\n'
        async def handler(request):
            requests.append(json.loads(request.content))
            if len(requests)==1: return httpx.Response(503,json={'error':'payload-secret'})
            step=len(requests)-1
            if step <= 3:
                body=chunk({'tool_calls':[{'index':0,'id':f'call-{step}','type':'function','function':{'name':'inspect_step','arguments':json.dumps({'step':step})}}]})+chunk({},'tool_calls')
            else: body=chunk({'content':'Planejamento pronto.'})+chunk({},'stop')
            return httpx.Response(200,headers={'content-type':'text/event-stream'},content=body+'data: [DONE]\n\n')
        history=[{'role':role,'content':f'context-{i}-{role}'} for i in range(40) for role in ('user','assistant')]
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            agent=Agent(model=OpenRouter(id='test',api_key='synthetic',http_client=client,max_retries=0,retries=0),tools=[inspect_step],tool_hooks=[hook],telemetry=False)
            with budget.provider_retry_scope():
                async for event in checked_agent_events(agent.arun(json.dumps(history),stream=True)):
                    if isinstance(getattr(event,'content',None),str): output.append(event.content)
        assert effects == [1,2,3]
        assert ''.join(output)=='Planejamento pronto.'
        assert requests[0] == requests[1]
        assert 'context-39-assistant' in json.dumps(requests[-1])
        assert len(requests)==5
    asyncio.run(run())
    assert 'phase=initial_failure' in caplog.text
    assert 'phase=retry' in caplog.text
    assert 'phase=recovered' in caplog.text
    assert 'payload-secret' not in caplog.text

# Cenário: falha de uma conversa não altera a política de outro turno concorrente.
def test_concurrent_turn_retry_scopes_are_isolated(monkeypatch):
    async def run():
        calls={}
        async def sleep(delay): pass
        monkeypatch.setattr(budget.asyncio,'sleep',sleep)
        async def handler(request):
            key=json.loads(request.content)['model']
            calls[key]=calls.get(key,0)+1
            return httpx.Response(503)
        async with budget.create_budgeted_http_client(transport=httpx.MockTransport(handler)) as client:
            async def turn(key, unsafe):
                with budget.provider_retry_scope() as state:
                    if unsafe: budget.mark_provider_output()
                    await client.post(URL,json={'model':key})
                    assert state['unsafe'] == unsafe
            await asyncio.gather(turn('read',False),turn('confirmed',True))
        assert calls == {'read':3,'confirmed':1}
    asyncio.run(run())
