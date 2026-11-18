"""O runtime salva contexto antes do modelo e retoma o snapshot causal."""
import json
from types import SimpleNamespace
from uuid import uuid4

import agno.agent
import pytest
from fastapi.testclient import TestClient

import app as chat


@pytest.fixture
def runtime(monkeypatch):
    cid, tenant, user, mid = (uuid4() for _ in range(4))
    events, captured, completions = [], [], []
    state = {'snapshot': None, 'save_error': False}

    class Pool:
        async def fetchrow(self, *_): return {'id': cid}
        async def fetch(self, *_): return []
        async def execute(self, *_): events.append('failed')
        async def close(self): pass

    class Repository:
        def __init__(self, *_): pass
        async def begin_run(self, *_, **kwargs): return uuid4(), uuid4(), mid
        async def memories(self, *_):
            events.append('memories')
            return [{'facts': json.dumps([{'topic': 'negócio', 'text': 'floricultura'}])}]
        async def history(self, *_):
            events.append('history')
            return state.get('history', [{'role': 'user', 'content': 'Não sei o que postar'}])

    class Checkpoints:
        def __init__(self, *args, **kwargs):
            assert args[1:4] == (tenant, user, cid)
            assert args[-1] == mid
            assert kwargs == {'policy_version': 'proactive-v2'}
        async def load_context(self):
            events.append('load')
            return state['snapshot']
        async def save_context(self, context, history):
            events.append('save')
            if state['save_error']:
                raise RuntimeError('private checkpoint write failure')
            state['snapshot'] = (context, history)
        async def cached_tool(self, *_):
            if state.get('tool_error'):
                raise RuntimeError('private checkpoint tool failure')
            return None
        async def record_tool(self, *_): pass

    class Fence:
        def __init__(self, *_): pass
        async def complete_many(self, _, contents, **kwargs):
            completions.extend(contents)
            return [{'id': str(uuid4()), 'role': 'assistant', 'content': content} for content in contents]

    class Attachments:
        def __init__(self, *_): pass
        async def load(self, *_, **kwargs):
            events.append('attachments')
            return SimpleNamespace(readings=[], notice='')

    class Agent:
        def __init__(self, **kwargs): self.options = kwargs
        def arun(self, messages, **kwargs):
            events.append('model')
            captured.append((self.options, messages))
            async def response():
                if state.get('tool_error'):
                    async def brand(): return {'name': 'Flores'}
                    try:
                        await self.options['tool_hooks'][0](brand, {}, function_name='brand')
                    except Exception as error:
                        state['tool_exception'] = str(error)
                yield SimpleNamespace(content='Legenda pronta para revisar.')
            return response()

    async def noop(*_, **kwargs): return False
    monkeypatch.setenv('MODEL_CHATBOT', 'synthetic')
    monkeypatch.setenv('ADY_API_URL', 'https://node.invalid')
    monkeypatch.setattr(chat, 'ConversationRepository', Repository)
    # raising=False allows the RED gate to demonstrate missing runtime wiring.
    monkeypatch.setattr(chat, 'CheckpointRepository', Checkpoints, raising=False)
    monkeypatch.setattr(chat, 'FencedDB', Fence)
    monkeypatch.setattr(chat, 'AttachmentContext', Attachments)
    monkeypatch.setattr(chat, 'consolidate', noop)
    monkeypatch.setattr(chat, 'generate_title', noop)
    monkeypatch.setattr(agno.agent, 'Agent', Agent)
    app = chat.create_app()
    app.dependency_overrides[chat.identity] = lambda: {'tenantId': tenant, 'userId': user}
    with TestClient(app) as client:
        app.state.pool = Pool()
        yield client, cid, events, captured, completions, state


def test_snapshot_is_saved_before_model(runtime):
    client, cid, events, _, _, state = runtime
    response = client.post(f'/conversations/{cid}/messages',
                           headers={'Authorization': 'Bearer synthetic'},
                           json={'content': 'Não sei o que postar'})
    assert 'event: done' in response.text
    assert 'save' in events
    assert events.index('save') < events.index('model')
    assert state['snapshot'][1][-1]['content'] == 'Não sei o que postar'


def test_recovery_exposes_uncertain_journal_without_mutation_tools(runtime):
    client,cid,_,captured,_,state = runtime
    state['snapshot'] = ([],[{'role':'user','content':'Pedido original'}])
    async def reads(query,*args):
        if 'SELECT id,path,display,body,status,result FROM chat_approvals' in query:
            return [{'id':uuid4(),'path':'/api/planner/posts','status':'unknown',
                     'display':'{}','body':'{}','result':json.dumps({'token':'private','error':'uncertain'})}]
        return []
    client.app.state.pool.fetch = reads
    response=client.post(f'/conversations/{cid}/retry',
                         headers={'Authorization':'Bearer synthetic'},json={'automatic':True})
    assert 'event: done' in response.text
    options,_=captured[-1]
    instructions=' '.join(options['instructions'])
    assert 'unknown' in instructions and 'uncertain' in instructions
    assert 'private' not in instructions
    assert not any(getattr(tool,'__name__','').startswith('propose_') for tool in options['tools'])


def test_retry_uses_snapshot_not_later_memories_or_history(runtime):
    client, cid, events, captured, _, state = runtime
    state['snapshot'] = ([{'topic': 'marca', 'text': 'snapshot antigo'}],
                         [{'role': 'user', 'content': 'Pedido original'}])
    response = client.post(f'/conversations/{cid}/retry',
                           headers={'Authorization': 'Bearer synthetic'})
    assert 'event: done' in response.text
    assert 'load' in events
    assert 'history' not in events and 'memories' not in events
    options, history = captured[0]
    assert history[-1].content == 'Pedido original'
    assert 'snapshot antigo' in ' '.join(options['instructions'])
    assert all(not getattr(tool, '__name__', '').startswith('propose_') for tool in options['tools'])


def test_snapshot_write_failure_never_calls_model_or_claims_completion(runtime):
    client, cid, events, _, completions, state = runtime
    state['save_error'] = True
    response = client.post(f'/conversations/{cid}/messages',
                           headers={'Authorization': 'Bearer synthetic'},
                           json={'content': 'Prepare um post'})
    assert 'event: error' in response.text
    assert 'event: done' not in response.text
    assert 'model' not in events and not completions
    assert 'private' not in response.text


def test_legacy_retry_without_snapshot_still_uses_causal_history(runtime):
    client, cid, events, captured, _, _ = runtime
    response = client.post(f'/conversations/{cid}/retry',
                           headers={'Authorization': 'Bearer synthetic'})
    assert 'event: done' in response.text
    assert 'load' in events and 'history' in events
    assert 'memories' not in events
    assert 'save' in events


def test_credential_like_text_is_redacted_without_poisoning_conversation(runtime):
    client, cid, _, captured, _, state = runtime
    state['history'] = [{'role': 'user', 'content': 'Explique Bearer private-example-token'}]
    for _ in range(2):
        response = client.post(f'/conversations/{cid}/messages',
                               headers={'Authorization': 'Bearer synthetic'},
                               json={'content': 'Prepare um post'})
        assert 'event: done' in response.text
    assert len(captured) == 2
    assert all('private-example-token' not in str(history) for _, history in captured)
    assert 'private-example-token' not in str(state['snapshot'])
    assert '[credencial omitida]' in str(state['snapshot'])


def test_tool_checkpoint_failure_cannot_be_swallowed_into_success(runtime):
    client, cid, _, _, completions, state = runtime
    state['tool_error'] = True
    response = client.post(f'/conversations/{cid}/messages',
                           headers={'Authorization': 'Bearer synthetic'},
                           json={'content': 'Prepare um post'})
    assert 'event: error' in response.text
    assert 'event: done' not in response.text
    assert not completions
    assert 'private' not in state['tool_exception']


def test_context_limit_does_not_tell_customer_to_discard_conversation(runtime, monkeypatch):
    client, cid, _, _, _, _ = runtime
    async def no_compression(*args, **kwargs): return False
    monkeypatch.setattr(chat, 'requires_compression', lambda size: True)
    monkeypatch.setattr(chat, 'compress_memories', no_compression)
    response = client.post(f'/conversations/{cid}/messages',
                           headers={'Authorization': 'Bearer synthetic'},
                           json={'content': 'Prepare um post'})
    assert 'event: error' in response.text
    assert 'Inicie uma nova conversa' not in response.text
    messages = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    assert any('histórico' in item.get('message', '').lower() for item in messages)


def test_postgres_retry_after_compaction_uses_original_checkpoint(monkeypatch):
    import asyncio
    import os
    from pathlib import Path
    import httpx
    from checkpoints import CheckpointRepository
    from assistant_policy import POLICY_VERSION
    from conversation_repository import ConversationRepository
    from attachment_repository import AttachmentRepository
    from runs import FencedDB
    from memory import consolidate
    from test_attachments_postgres import database

    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated PostgreSQL not configured')

    async def scenario():
        async with database() as (pool, tenant, user, cid):
            migrations = Path(__file__).resolve().parents[3] / 'packages/db/migrations'
            await pool.execute((migrations / '0080_chat_turn_checkpoints.sql').read_text())
            repo = ConversationRepository(pool, tenant, user)
            for index in range(2):
                previous, previous_lease, _ = await repo.begin_run(cid, f'Pedido anterior {index}')
                await FencedDB(pool, previous, previous_lease).complete(cid, f'Resposta anterior {index}')
            run, lease, mid = await repo.begin_run(cid, 'Prepare um post para flores')
            snapshot = CheckpointRepository(pool, tenant, user, cid, run, lease, mid,
                                            policy_version=POLICY_VERSION)
            frozen_history = [
                {'role': row['role'], 'content': row['content']}
                for row in await repo.history(cid, mid)
            ]
            await snapshot.save_context(
                [[{'topic': 'marca', 'text': 'Contexto original'}]],
                frozen_history,
            )
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", run)
            # Execute actual compaction/pruning after the interrupted turn.
            async def summarize(previous, messages):
                return json.dumps({'facts': [{'topic': 'resumo', 'text': 'Fato compactado'}]})
            assert await consolidate(
                pool, cid, summarize, min_responses=2,
                message_repository=AttachmentRepository(pool, tenant, user),
            )
            assert await pool.fetchval('SELECT count(*) FROM chat_messages WHERE conversation_id=$1', cid) == 1
            calls = []
            class Agent:
                def __init__(self, **options): self.options = options
                def arun(self, messages, **kwargs):
                    calls.append((self.options, messages))
                    async def response(): yield SimpleNamespace(content='Legenda recuperada.')
                    return response()
            async def noop(*args, **kwargs): return False
            monkeypatch.setattr(agno.agent, 'Agent', Agent)
            monkeypatch.setattr(chat, 'consolidate', noop)
            monkeypatch.setattr(chat, 'generate_title', noop)
            monkeypatch.setenv('MODEL_CHATBOT', 'synthetic')
            monkeypatch.setenv('ADY_API_URL', 'https://node.invalid')
            app = chat.create_app()
            app.dependency_overrides[chat.identity] = lambda: {'tenantId': tenant, 'userId': user}
            async with app.router.lifespan_context(app):
                app.state.pool = pool
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                             base_url='http://chat') as client:
                    response = await client.post(f'/conversations/{cid}/retry?run_id={run}',
                                                 headers={'Authorization': 'Bearer synthetic'})
                    assert response.status_code == 200, response.text
                    assert 'event: done' in response.text
                    options, history = calls[0]
                    assert 'Contexto original' in ' '.join(options['instructions'])
                    assert 'Fato compactado' not in ' '.join(options['instructions'])
                    assert [message.content for message in history] == [row['content'] for row in frozen_history]
                    assert history[-1].content == 'Prepare um post para flores'
                    assert await pool.fetchval(
                        "SELECT count(*) FROM chat_messages WHERE role='user' AND conversation_id=$1", cid
                    ) == 1
                app.state.pool = None
    asyncio.run(scenario())


def test_older_checkpoint_does_not_unlock_compacted_latest_turn():
    import asyncio
    import os
    from checkpoints import CheckpointRepository
    from conversation_repository import ConversationRepository
    from attachment_repository import ConversationError
    from test_attachments_postgres import database

    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated PostgreSQL not configured')

    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            first, lease, mid = await repo.begin_run(cid, 'Pedido com snapshot')
            await CheckpointRepository(pool, tenant, user, cid, first, lease, mid).save_context(
                [], [{'role': 'user', 'content': 'Pedido com snapshot'}],
            )
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", first)
            latest, _, _ = await repo.begin_run(cid, 'Pedido legado sem snapshot')
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", latest)
            await pool.execute("INSERT INTO chat_memories(conversation_id,facts) VALUES($1,'[]')", cid)
            with pytest.raises(ConversationError) as caught:
                await repo.begin_run(cid, retry=True)
            assert caught.value.code == 'retry_compacted'
            _, _, original = await repo.begin_run(cid, retry=True, retry_run_id=first)
            assert original == mid
    asyncio.run(scenario())
