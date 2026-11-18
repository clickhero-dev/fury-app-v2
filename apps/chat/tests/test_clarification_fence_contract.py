"""Regression coverage for causal clarification fences and SSE negotiation."""
import asyncio
import json
import os
from types import SimpleNamespace

import pytest
from attachment_repository import ConversationError
from conversation_repository import ConversationRepository
from runs import FencedDB
from test_attachments_postgres import database, URL

pytestmark = pytest.mark.skipif(not URL, reason='CHAT_MEDIA_TEST_DATABASE_URL isolado ausente')


def test_late_clarification_is_closed_and_cannot_be_selected():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            run, lease, _ = await repo.begin_run(cid, 'Antiga')
            await repo.begin_run(cid, 'Nova')
            await FencedDB(pool, run, lease).complete_many(cid, ['Resposta'], clarification={'question':'Qual?', 'choices':['Um', 'Dois']})
            clar = await pool.fetchrow('SELECT * FROM chat_clarifications WHERE run_id=$1', run)
            assert clar['dismissed_at'] is not None
            with pytest.raises(ConversationError) as error:
                await repo.begin_run(cid, clarification_id=clar['id'], choice_index=0)
            assert error.value.code == 'clarification_closed'
    asyncio.run(scenario())


def test_completion_waits_for_newer_turn_transaction_before_fencing():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            run, lease, _ = await repo.begin_run(cid, 'Antiga')
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.fetchval('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE', cid)
                    await conn.execute("INSERT INTO chat_messages(conversation_id,role,content,created_at) VALUES($1,'user','Nova',clock_timestamp())", cid)
                    completing = asyncio.create_task(FencedDB(pool, run, lease).complete_many(cid, ['Resposta'], clarification={'question':'Qual?', 'choices':['Um','Dois']}))
                    await asyncio.sleep(.05)
                    assert not completing.done()
                await completing
            clar = await pool.fetchrow('SELECT * FROM chat_clarifications WHERE run_id=$1', run)
            assert clar['dismissed_at'] is not None
    asyncio.run(scenario())


def test_selection_waits_for_concurrent_new_turn_and_rejects_it():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            run, lease, _ = await repo.begin_run(cid, 'Antiga')
            await FencedDB(pool, run, lease).complete_many(cid, ['Resposta'], clarification={'question':'Qual?', 'choices':['Um','Dois']})
            clar = await pool.fetchval('SELECT id FROM chat_clarifications WHERE run_id=$1', run)
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.fetchval('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE', cid)
                    await conn.execute("INSERT INTO chat_messages(conversation_id,role,content,created_at) VALUES($1,'user','Nova',clock_timestamp())", cid)
                    selecting = asyncio.create_task(repo.begin_run(cid, clarification_id=clar, choice_index=0))
                    await asyncio.sleep(.05)
                    assert not selecting.done()
                with pytest.raises(ConversationError) as error:
                    await selecting
                assert error.value.code == 'clarification_closed'
            assert await pool.fetchval('SELECT selected_index FROM chat_clarifications WHERE id=$1', clar) is None
    asyncio.run(scenario())


def test_selection_rejects_preexisting_stale_record():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            run, lease, _ = await repo.begin_run(cid, 'Antiga')
            await repo.begin_run(cid, 'Nova')
            await FencedDB(pool, run, lease).complete_many(cid, ['Resposta'], clarification={'question':'Qual?', 'choices':['Um','Dois']})
            clar = await pool.fetchval('UPDATE chat_clarifications SET dismissed_at=NULL WHERE run_id=$1 RETURNING id', run)
            with pytest.raises(ConversationError) as error:
                await repo.begin_run(cid, clarification_id=clar, choice_index=0)
            assert error.value.code == 'clarification_closed'
    asyncio.run(scenario())


@pytest.mark.parametrize('modern', [False, True])
def test_stream_contract_old_and_new_clients(monkeypatch, modern):
    import httpx
    import agno.agent
    import app as chat_app
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            class Agent:
                def __init__(self, **kwargs): pass
                def arun(self, *args, **kwargs):
                    async def stream():
                        yield SimpleNamespace(content='ADY_MES')
                        yield SimpleNamespace(content='SAGES:{"messages":["Primeira","Segunda"],"clarify":{"question":"Qual?","choices":["Um","Dois"]}}')
                    return stream()
            monkeypatch.setattr(agno.agent, 'Agent', Agent)
            monkeypatch.setenv('MODEL_CHATBOT', 'fake/model')
            monkeypatch.setenv('ADY_API_URL', 'http://node.invalid')
            monkeypatch.setenv('DATABASE_URL', os.environ['CHAT_MEDIA_TEST_DATABASE_URL'])
            async def noop(*args, **kwargs): return None
            monkeypatch.setattr(chat_app, 'generate_title', noop)
            monkeypatch.setattr(chat_app, 'consolidate', noop)
            app = chat_app.create_app()
            app.dependency_overrides[chat_app.identity] = lambda: {'tenantId':tenant, 'userId':user}
            async with app.router.lifespan_context(app):
                app.state.pool = pool
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://chat', headers={'authorization':'Bearer test'}) as client:
                    body = {'content':'pergunta'}
                    if modern: body['responseCapabilities'] = ['multi_message_v1']
                    response = await client.post(f'/conversations/{cid}/messages', json=body)
                    assert response.status_code == 200
                    assert 'ADY_MESSAGES' not in response.text
                    events = [frame.split('\n') for frame in response.text.strip().split('\n\n')]
                    done = next(json.loads(line[6:]) for frame in events if 'event: done' in frame for line in frame if line.startswith('data: '))
                    saved = (await client.get(f'/conversations/{cid}')).json()
                    if modern:
                        assert not any('event: token' in frame for frame in events)
                        assert [m['content'] for m in done['messages']] == ['Primeira','Segunda']
                        assert done['clarification']['question'] == 'Qual?'
                        assert [m['content'] for m in saved['messages'][1:]] == ['Primeira','Segunda']
                        await ConversationRepository(pool, tenant, user).begin_run(cid, 'Nova mensagem')
                        await pool.execute('UPDATE chat_clarifications SET dismissed_at=NULL WHERE id=$1', done['clarification']['id'])
                        reloaded = (await client.get(f'/conversations/{cid}')).json()
                        assert reloaded['clarifications'][0]['dismissed_at'] is not None
                        rejected = await client.post(f"/conversations/{cid}/clarifications/{done['clarification']['id']}/answer", json={'choiceIndex':0, 'responseCapabilities':['multi_message_v1']})
                        assert rejected.status_code == 409
                    else:
                        text = done['message']['content']
                        for item in ('Primeira', 'Segunda', 'Qual?', 'Um', 'Dois'): assert text.count(item) == 1
                        tokens = [json.loads(line[6:])['content'] for frame in events if 'event: token' in frame for line in frame if line.startswith('data: ')]
                        assert ''.join(tokens) == text
                        assert saved['messages'][-1]['content'] == text
                        assert not saved['clarifications']
                app.state.pool = None
    asyncio.run(scenario())
