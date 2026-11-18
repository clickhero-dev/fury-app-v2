"""Funcionalidade: falha de provedor vira erro recuperável no turno persistido.
Dado uma conversa própria e provedor simulado
Quando há stream incompleto ou prazo vencido
Então SSE informa erro, run falha e retomada preserva mensagem sem duplicar ações.
"""
import asyncio
import json
import os

import httpx
import pytest

import app as chat_app
import model_request_budget as budget
import test_attachments_postgres as fixtures

pytestmark = pytest.mark.skipif(not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'), reason='isolated database not configured')


@pytest.mark.parametrize('failure', ['truncated', 'deadline'])
def test_provider_failure_is_visible_and_retry_preserves_turn(monkeypatch, failure):
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            requests=[]
            def chunk(content):
                return ('data: '+json.dumps({'id':'mock','choices':[{'index':0,'delta':{'content':content},'finish_reason':None}]})+'\n\n').encode()
            class Broken(httpx.AsyncByteStream):
                async def __aiter__(self):
                    yield chunk('Vou levantar os dados.')
                    if failure == 'deadline': await asyncio.Event().wait()
            async def handler(request):
                requests.append(json.loads(request.content))
                if len(requests)==1:
                    return httpx.Response(200,headers={'content-type':'text/event-stream'},stream=Broken())
                return httpx.Response(200,headers={'content-type':'text/event-stream'},content=chunk('Proposta pronta.')+b'data: [DONE]\n\n')
            monkeypatch.setenv('MODEL_CHATBOT','synthetic/model')
            monkeypatch.setenv('OPENROUTER_API_KEY','synthetic')
            monkeypatch.delenv('OPENAI_API_KEY', raising=False)
            monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
            monkeypatch.setenv('ADY_API_URL','https://ady.invalid')
            monkeypatch.setenv('POSTHOG_API_KEY','')
            monkeypatch.setenv('DATABASE_URL',os.environ['CHAT_MEDIA_TEST_DATABASE_URL'])
            original=chat_app.checked_agent_events
            monkeypatch.setattr(chat_app,'checked_agent_events',lambda events,state: original(events,state,timeout=0.2 if failure == 'deadline' and not requests else 5))
            async def noop(*args,**kwargs): pass
            monkeypatch.setattr(chat_app,'consolidate',noop)
            monkeypatch.setattr(chat_app,'generate_title',noop)
            application=chat_app.create_app()
            application.dependency_overrides[chat_app.identity]=lambda: {'tenantId':tenant,'userId':user}
            async with application.router.lifespan_context(application):
                application.state.pool=pool
                application.state.model_http._transport = httpx.MockTransport(handler)
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application),base_url='http://chat',headers={'authorization':'Bearer synthetic'}) as client:
                    failed=await client.post(f'/conversations/{cid}/messages',json={'content':'Planeje novembro'})
                    assert 'event: error' in failed.text
                    assert 'event: done' not in failed.text
                    first=await pool.fetchrow('SELECT * FROM chat_response_runs WHERE conversation_id=$1',cid)
                    assert first['status']=='failed'
                    durable=await pool.fetchrow('SELECT * FROM chat_turn_recovery WHERE user_message_id=$1',first['user_message_id'])
                    assert durable['status']=='queued'
                    assert durable['provider_requests']==1
                    await pool.execute('UPDATE chat_turn_recovery SET next_attempt_at=clock_timestamp()')
                    resumed=await client.post(f'/conversations/{cid}/retry?run_id={first["id"]}',json={'automatic':True})
                    assert 'event: done' in resumed.text
                    assert 'event: error' not in resumed.text
                    rows=await pool.fetch('SELECT * FROM chat_response_runs WHERE conversation_id=$1',cid)
                    assert len(rows)==2
                    assert all(row['user_message_id']==first['user_message_id'] for row in rows)
                    assert await pool.fetchval('SELECT count(*) FROM chat_messages WHERE conversation_id=$1',cid)==2
                    assert await pool.fetchval('SELECT count(*) FROM chat_approvals WHERE conversation_id=$1',cid)==0
                    assert len(requests)==2
                    durable=await pool.fetchrow('SELECT * FROM chat_turn_recovery WHERE user_message_id=$1',first['user_message_id'])
                    assert durable['status']=='completed' and durable['attempts']==1 and durable['provider_requests']==2
                    assert 'Planeje novembro' in json.dumps(requests[-1]['messages'])
                    names=[tool['function']['name'] for tool in requests[-1]['tools']]
                    assert not any(name.startswith('propose_') for name in names)
                application.state.pool=None
    asyncio.run(scenario())


def test_runtime_fallback_charges_each_provider_and_persists_one_response(monkeypatch):
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            hosts = []
            def handler(request):
                hosts.append(request.url.host)
                if len(hosts) < 3:
                    return httpx.Response(503, json={'error': {'message': 'private'}})
                chunk = {'id':'mock','object':'chat.completion.chunk','created':1,'model':'x',
                         'choices':[{'index':0,'delta':{'content':'Resposta preservada.'},'finish_reason':None}]}
                return httpx.Response(200, headers={'content-type':'text/event-stream'},
                    content='data: '+json.dumps(chunk)+'\n\ndata: [DONE]\n\n')
            for key in ('OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'):
                monkeypatch.setenv(key, 'synthetic')
            monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
            monkeypatch.setenv('POSTHOG_API_KEY', '')
            async def noop(*_args, **_kwargs): pass
            monkeypatch.setattr(chat_app, 'consolidate', noop)
            monkeypatch.setattr(chat_app, 'generate_title', noop)
            application = chat_app.create_app()
            application.dependency_overrides[chat_app.identity] = lambda: {'tenantId':tenant,'userId':user}
            async with application.router.lifespan_context(application):
                application.state.pool = pool
                application.state.model_http._transport = httpx.MockTransport(handler)
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application),
                        base_url='http://chat', headers={'authorization':'Bearer synthetic'}) as client:
                    response = await client.post(f'/conversations/{cid}/messages', json={'content':'Olá'})
                assert 'event: done' in response.text and 'private' not in response.text
                assert hosts == ['api.openai.com', 'api.anthropic.com', 'openrouter.ai']
                row = await pool.fetchrow('SELECT * FROM chat_turn_recovery WHERE conversation_id=$1', cid)
                assert row['provider_requests'] == 3 and row['status'] == 'completed'
                assert await pool.fetchval("SELECT count(*) FROM chat_messages WHERE conversation_id=$1 AND role='assistant'", cid) == 1
                application.state.pool = None
    asyncio.run(scenario())
