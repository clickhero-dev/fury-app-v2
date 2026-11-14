"""BDD: respostas de uma execução são atômicas, ordenadas e associadas."""
import asyncio
from pathlib import Path
import pytest
from runs import FencedDB, RunExpired
from conversation_repository import ConversationRepository
from test_attachments_postgres import database, URL

pytestmark = pytest.mark.skipif(not URL, reason='CHAT_MEDIA_TEST_DATABASE_URL isolado ausente')


def test_ordered_atomic_messages_and_concurrent_runs():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            migration = Path(__file__).resolve().parents[3] / 'packages/db/migrations/0074_chat_response_messages.sql'
            if migration.exists():
                await pool.execute(migration.read_text())
            repo = ConversationRepository(pool, tenant, user)
            first, lease1, user1 = await repo.begin_run(cid, 'Primeira pergunta')
            second, lease2, user2 = await repo.begin_run(cid, 'Segunda pergunta')
            rows2 = await FencedDB(pool, second, lease2).complete_many(cid, ['B1', 'B2'])
            rows1 = await FencedDB(pool, first, lease1).complete_many(cid, ['A1', 'A2', 'A3'])
            assert [r['content'] for r in rows1] == ['A1', 'A2', 'A3']
            linked = await pool.fetch('''SELECT r.user_message_id,rm.position,m.content FROM chat_response_messages rm
                JOIN chat_response_runs r ON r.id=rm.run_id JOIN chat_messages m ON m.id=rm.message_id
                WHERE r.conversation_id=$1 ORDER BY r.id,rm.position''', cid)
            assert [r['content'] for r in linked if r['user_message_id'] == user1] == ['A1', 'A2', 'A3']
            assert [r['content'] for r in linked if r['user_message_id'] == user2] == ['B1', 'B2']
            assert len(rows2) == 2
            _, _, third = await repo.begin_run(cid, 'Terceira')
            history = await repo.history(cid, third)
            assert [row['content'] for row in history] == ['Primeira pergunta', 'A1', 'A2', 'A3', 'Segunda pergunta', 'B1', 'B2', 'Terceira']
            with pytest.raises(RunExpired):
                await FencedDB(pool, first, lease1).complete_many(cid, ['duplicada'])
            assert await pool.fetchval("SELECT count(*) FROM chat_messages WHERE conversation_id=$1 AND role='assistant'", cid) == 5
    asyncio.run(scenario())


def test_old_clarification_rejects_selection_after_a_new_user_message():
    from attachment_repository import ConversationError
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            run, lease, _ = await repo.begin_run(cid, 'Pergunta')
            await FencedDB(pool, run, lease).complete_many(cid, ['Qual?'], clarification={'question':'Qual?', 'choices':['Um','Dois']})
            clarification_id = await pool.fetchval('SELECT id FROM chat_clarifications WHERE run_id=$1', run)
            await repo.begin_run(cid, 'Mudei de assunto')
            with pytest.raises(ConversationError) as error:
                await repo.begin_run(cid, clarification_id=clarification_id, choice_index=0)
            assert error.value.status_code == 409
            assert error.value.code == 'clarification_closed'
    asyncio.run(scenario())


def test_clarification_selection_is_atomic_single_use_and_owner_scoped():
    from uuid import uuid4
    from attachment_repository import ConversationError
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            run, lease, _ = await repo.begin_run(cid, 'Pergunta')
            await FencedDB(pool, run, lease).complete_many(cid, ['Qual?'], clarification={'question':'Qual?', 'choices':['Um','Dois']})
            clarification_id = await pool.fetchval('SELECT id FROM chat_clarifications WHERE run_id=$1', run)
            with pytest.raises(ConversationError):
                await ConversationRepository(pool, uuid4(), user).begin_run(cid, clarification_id=clarification_id, choice_index=0)
            with pytest.raises(ConversationError):
                await repo.begin_run(cid, clarification_id=clarification_id, choice_index=5)
            results = await asyncio.gather(*(repo.begin_run(cid, clarification_id=clarification_id, choice_index=1) for _ in range(2)), return_exceptions=True)
            assert sum(isinstance(result, tuple) for result in results) == 1
            assert sum(isinstance(result, ConversationError) for result in results) == 1
            selected = await pool.fetchrow('SELECT selected_index,answer_message_id FROM chat_clarifications WHERE id=$1', clarification_id)
            assert selected['selected_index'] == 1
            assert await pool.fetchval('SELECT content FROM chat_messages WHERE id=$1', selected['answer_message_id']) == 'Dois'
    asyncio.run(scenario())


def test_compaction_preserves_run_pairing_when_completion_order_is_reversed():
    import json
    from memory import consolidate
    from attachment_repository import AttachmentRepository
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            first, lease1, _ = await repo.begin_run(cid, 'Primeira')
            second, lease2, _ = await repo.begin_run(cid, 'Segunda')
            await FencedDB(pool, second, lease2).complete_many(cid, ['B1', 'B2'])
            await FencedDB(pool, first, lease1).complete_many(cid, ['A1', 'A2'])
            seen = []
            async def summary(_previous, rows):
                seen.extend(r['content'] for r in rows)
                return json.dumps({'facts':[{'topic':'teste','text':'resumo'}]})
            assert await consolidate(pool, cid, summary, min_responses=2, message_repository=AttachmentRepository(pool, tenant, user))
            assert seen == ['Primeira', 'A1', 'A2', 'Segunda', 'B1', 'B2']
    asyncio.run(scenario())


def test_compaction_preserves_answered_clarification_in_summary():
    import json
    from memory import consolidate
    from attachment_repository import AttachmentRepository
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            run, lease, _ = await repo.begin_run(cid, 'Pergunta')
            await FencedDB(pool, run, lease).complete_many(cid, ['Escolha'], clarification={'question':'Qual?', 'choices':['Um','Dois']})
            clar = await pool.fetchval('SELECT id FROM chat_clarifications WHERE run_id=$1', run)
            run2, lease2, _ = await repo.begin_run(cid, clarification_id=clar, choice_index=1)
            await FencedDB(pool, run2, lease2).complete_many(cid, ['Entendi'])
            seen = []
            async def summary(_previous, rows):
                seen.extend(r['content'] for r in rows)
                return json.dumps({'facts':[{'topic':'teste','text':'resumo'}]})
            assert await consolidate(pool, cid, summary, min_responses=2, message_repository=AttachmentRepository(pool, tenant, user))
            assert any('Qual?' in content and 'Dois' in content for content in seen)
    asyncio.run(scenario())


def test_pending_clarification_is_not_deleted_by_compaction():
    import json
    from memory import consolidate
    from attachment_repository import AttachmentRepository
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            run, lease, _ = await ConversationRepository(pool, tenant, user).begin_run(cid, 'Pergunta')
            await FencedDB(pool, run, lease).complete_many(cid, ['Qual?'], clarification={'question':'Qual?', 'choices':['Um','Dois']})
            async def summary(_previous, _rows):
                return json.dumps({'facts':[{'topic':'teste','text':'resumo'}]})
            assert not await consolidate(pool, cid, summary, min_responses=1, message_repository=AttachmentRepository(pool, tenant, user))
            assert await pool.fetchval('SELECT count(*) FROM chat_clarifications WHERE conversation_id=$1', cid) == 1
    asyncio.run(scenario())


def test_compaction_keeps_all_messages_of_a_run_together():
    import json
    from memory import consolidate
    from attachment_repository import AttachmentRepository
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            run, lease, _ = await repo.begin_run(cid, 'Pergunta')
            await FencedDB(pool, run, lease).complete_many(cid, ['Primeira', 'Segunda'])
            summarized = []
            async def summary(_previous, rows):
                summarized.extend(r['content'] for r in rows)
                return json.dumps({'facts':[{'topic':'teste','text':'resumo'}]})
            assert await consolidate(pool, cid, summary, min_responses=1, message_repository=AttachmentRepository(pool, tenant, user))
            assert summarized == ['Pergunta', 'Primeira', 'Segunda']
            assert await pool.fetchval('SELECT count(*) FROM chat_messages WHERE conversation_id=$1', cid) == 0
    asyncio.run(scenario())


def test_http_clarification_persists_and_can_be_answered_once(monkeypatch):
    import os
    import httpx
    import agno.agent
    import app as chat_app
    from types import SimpleNamespace
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            captured = []
            class Agent:
                def __init__(self, **kwargs): pass
                def arun(self, messages, **kwargs):
                    captured.append([m.content for m in messages])
                    async def stream():
                        content = 'ADY_MESSAGES:{"messages":["Preciso saber."],"clarify":{"question":"Qual?","choices":["Um","Dois"]}}' if messages[-1].content == 'pergunta' else 'Entendi'
                        yield SimpleNamespace(content=content)
                    return stream()
            monkeypatch.setattr(agno.agent, 'Agent', Agent)
            monkeypatch.setenv('MODEL_CHATBOT', 'fake/model')
            monkeypatch.setenv('ADY_API_URL', 'http://node.invalid')
            monkeypatch.setenv('DATABASE_URL', os.environ['CHAT_MEDIA_TEST_DATABASE_URL'])
            async def noop(*_args, **_kwargs): return None
            monkeypatch.setattr(chat_app, 'generate_title', noop)
            monkeypatch.setattr(chat_app, 'consolidate', noop)
            app = chat_app.create_app()
            app.dependency_overrides[chat_app.identity] = lambda: {'tenantId':tenant, 'userId':user}
            async with app.router.lifespan_context(app):
                app.state.pool = pool
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://chat', headers={'authorization':'Bearer test'}) as client:
                    response = await client.post(f'/conversations/{cid}/messages', json={'content':'pergunta', 'responseCapabilities':['multi_message_v1']})
                    assert 'event: done' in response.text
                    saved = (await client.get(f'/conversations/{cid}')).json()
                    clar = saved['clarifications'][0]
                    assert clar['choices'] == ['Um', 'Dois'] and clar['selected_index'] is None
                    url = f'/conversations/{cid}/clarifications/{clar["id"]}/answer'
                    from uuid import uuid4
                    app.dependency_overrides[chat_app.identity] = lambda: {'tenantId':uuid4(), 'userId':user}
                    assert (await client.post(url, json={'choiceIndex':0})).status_code == 404
                    app.dependency_overrides[chat_app.identity] = lambda: {'tenantId':tenant, 'userId':user}
                    assert (await client.post(url, json={'choiceIndex':6})).status_code == 400
                    answered = await client.post(url, json={'choiceIndex':1})
                    assert 'event: done' in answered.text
                    assert any('Qual?' in content and 'Um' in content and 'Dois' in content for content in captured[-1])
                    assert (await client.post(url, json={'choiceIndex':0})).status_code == 409
                    saved = (await client.get(f'/conversations/{cid}')).json()
                    assert saved['clarifications'][0]['selected_index'] == 1
                    assert [m['content'] for m in saved['messages']] == ['pergunta', 'Preciso saber.', 'Dois', 'Entendi']
                app.state.pool = None
    asyncio.run(scenario())


@pytest.mark.parametrize('chunks,expected', [
    ([' \n', 'ADY_MES', 'SAGES:{"messages":["Primeira", "Segunda"]}'], ['Primeira', 'Segunda']),
    (['A' * 10000, 'A' * 10001], ['A' * 20001]),
])
def test_http_structured_response_and_reload(monkeypatch, chunks, expected):
    import os
    import httpx
    import agno.agent
    import app as chat_app
    from types import SimpleNamespace
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            class Agent:
                def __init__(self, **kwargs): pass
                def arun(self, *args, **kwargs):
                    async def stream():
                        for chunk in chunks:
                            yield SimpleNamespace(content=chunk)
                    return stream()
            monkeypatch.setattr(agno.agent, 'Agent', Agent)
            monkeypatch.setenv('MODEL_CHATBOT', 'fake/model')
            monkeypatch.setenv('ADY_API_URL', 'http://node.invalid')
            monkeypatch.setenv('DATABASE_URL', os.environ['CHAT_MEDIA_TEST_DATABASE_URL'])
            async def noop(*_args, **_kwargs): return None
            monkeypatch.setattr(chat_app, 'generate_title', noop)
            monkeypatch.setattr(chat_app, 'consolidate', noop)
            app = chat_app.create_app()
            app.dependency_overrides[chat_app.identity] = lambda: {'tenantId':tenant, 'userId':user}
            async with app.router.lifespan_context(app):
                app.state.pool = pool
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://chat', headers={'authorization':'Bearer test'}) as client:
                    response = await client.post(f'/conversations/{cid}/messages', json={'content':'pergunta', 'responseCapabilities':['multi_message_v1']})
                    assert 'event: done' in response.text
                    assert 'ADY_MESSAGES' not in response.text
                    saved = (await client.get(f'/conversations/{cid}')).json()
                    assert [m['content'] for m in saved['messages']] == ['pergunta', *expected]
                    assert '"messages":' in response.text
                app.state.pool = None
    asyncio.run(scenario())
