import asyncio
from uuid import uuid4

from conversation_repository import ConversationRepository


def test_starting_second_run_does_not_reject_active_run():
    class Connection:
        def transaction(self): return self
        async def __aenter__(self): return self
        async def __aexit__(self, *_): pass
        async def execute(self, *_): pass
        async def fetchval(self, query, *_):
            if 'SELECT 1 FROM chat_response_runs' in query:
                return 1
            return uuid4()
    conn = Connection()
    class Pool:
        def acquire(self): return conn
    repo = ConversationRepository(Pool(), uuid4(), uuid4())
    result = asyncio.run(repo.begin_run(uuid4(), 'second'))
    assert len(result) == 3


def test_postgres_two_runs_keep_own_context_and_answer(monkeypatch):
    import os
    import pytest
    import test_attachments_postgres as fixtures
    from runs import FencedDB
    from pathlib import Path
    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated database not configured')
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            migration = Path(__file__).resolve().parents[3] / 'packages/db/migrations/0072_chat_concurrent_runs.sql'
            await pool.execute(migration.read_text())
            repo = ConversationRepository(pool, tenant, user)
            run1, lease1, msg1 = await repo.begin_run(cid, 'first')
            run2, lease2, msg2 = await repo.begin_run(cid, 'second')
            assert [row['content'] for row in await repo.history(cid, msg1)] == ['first']
            assert [row['content'] for row in await repo.history(cid, msg2)] == ['second']
            second = await FencedDB(pool, run2, lease2).complete(cid, 'answer second')
            first = await FencedDB(pool, run1, lease1).complete(cid, 'answer first')
            assert await pool.fetchval('SELECT assistant_message_id FROM chat_response_runs WHERE id=$1', run1) == first['id']
            assert await pool.fetchval('SELECT assistant_message_id FROM chat_response_runs WHERE id=$1', run2) == second['id']
            assert [row['content'] for row in await repo.history(cid, msg1)] == ['first']
    asyncio.run(scenario())


def test_postgres_targeted_retry_and_attachment_cutoff():
    import os
    import pytest
    import test_attachments_postgres as fixtures
    from pathlib import Path
    from attachment_repository import AttachmentRepository, ConversationError
    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated database not configured')
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            await pool.execute((Path(__file__).resolve().parents[3] / 'packages/db/migrations/0072_chat_concurrent_runs.sql').read_text())
            repo = ConversationRepository(pool, tenant, user)
            a = await fixtures.attach(pool, tenant, user, cid)
            run1, _, msg1 = await repo.begin_run(cid, 'first', attachment_ids=[a])
            b = await fixtures.attach(pool, tenant, user, cid)
            run2, _, msg2 = await repo.begin_run(cid, 'second', attachment_ids=[b])
            files = await AttachmentRepository(pool, tenant, user).associated(cid, through_message_id=msg1)
            assert [row['id'] for row in files] == [a]
            files_for_second = await AttachmentRepository(pool, tenant, user).associated(cid, through_message_id=msg2)
            assert [row['id'] for row in files_for_second] == [b]
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", run1)
            new_run, _, reused = await repo.begin_run(cid, retry=True, retry_run_id=run1)
            assert reused == msg1 and new_run != run1
            with pytest.raises(ConversationError):
                await repo.begin_run(cid, retry=True, retry_run_id=run1)
            with pytest.raises(ConversationError):
                await repo.delete(cid, lambda: None)
            assert await pool.fetchval('SELECT status FROM chat_response_runs WHERE id=$1', run2) == 'running'
    asyncio.run(scenario())


def test_attachment_reader_restricts_files_to_current_run():
    from attachment_context import AttachmentContext
    calls = []
    class Repo:
        async def associated(self, conversation_id, *, through_message_id=None):
            calls.append((conversation_id, through_message_id))
            return []
    mid, cid = uuid4(), uuid4()
    asyncio.run(AttachmentContext(Repo(), None).load(cid, mid, 'question', causal=True))
    assert calls == [(cid, mid)]


def test_http_concurrent_streams_keep_own_message_and_links(monkeypatch):
    import os
    import pytest
    import httpx
    import agno.agent
    import app as chat_app
    import test_attachments_postgres as fixtures
    from types import SimpleNamespace
    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated database not configured')
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            started, release = asyncio.Event(), asyncio.Event()
            captured = []
            class Agent:
                def __init__(self, **_kwargs): pass
                def arun(self, messages, **_kwargs):
                    async def stream():
                        history = [m.content for m in messages]
                        captured.append(history)
                        if history[-1] == 'first':
                            started.set()
                            await release.wait()
                        yield SimpleNamespace(content='answer ' + history[-1])
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
                    first_key = str(uuid4())
                    first = asyncio.create_task(client.post(f'/conversations/{cid}/messages', json={'content':'first', 'clientKey':first_key}))
                    await asyncio.wait_for(started.wait(), 5)
                    duplicate = await client.post(f'/conversations/{cid}/messages', json={'content':'first', 'clientKey':first_key})
                    assert duplicate.status_code == 409
                    second = await client.post(f'/conversations/{cid}/messages', json={'content':'second'})
                    release.set()
                    first = await first
                    assert first.status_code == second.status_code == 200
                    assert 'event: run' in first.text and 'event: done' in first.text
                    assert first.text.count(first_key) == 2
                    assert ['first'] in captured and ['second'] in captured
                    data = (await client.get(f'/conversations/{cid}')).json()
                    assert len(data['response_runs']) == 2
                    assert sum(run['client_key'] == first_key for run in data['response_runs']) == 1
                    messages = {m['id']: m['content'] for m in data['messages']}
                    for run in data['response_runs']:
                        assert messages[run['assistant_message_id']] == 'answer ' + messages[run['user_message_id']]
                app.state.pool = None
    asyncio.run(scenario())


def test_completion_serializes_with_new_message_snapshot():
    import os
    import pytest
    import test_attachments_postgres as fixtures
    from runs import FencedDB
    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated database not configured')
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            run, lease, _ = await ConversationRepository(pool, tenant, user).begin_run(cid, 'first')
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.fetchval('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE', cid)
                    task = asyncio.create_task(FencedDB(pool, run, lease).complete(cid, 'answer'))
                    await asyncio.sleep(.1)
                    assert not task.done()
                    later = await conn.fetchval("INSERT INTO chat_messages(conversation_id,role,content,created_at) VALUES($1,'user','second',clock_timestamp()) RETURNING id", cid)
                assert (await asyncio.wait_for(task, 3))['content'] == 'answer'
                assert [m['content'] for m in await ConversationRepository(pool, tenant, user).history(cid, later)] == ['second']
    asyncio.run(scenario())


def test_completion_cannot_use_lease_expired_while_waiting_for_lock():
    import os
    import pytest
    import test_attachments_postgres as fixtures
    from runs import FencedDB, RunExpired
    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated database not configured')
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            run, lease, _ = await ConversationRepository(pool, tenant, user).begin_run(cid, 'first')
            await pool.execute("UPDATE chat_response_runs SET lease_until=clock_timestamp()+interval '0.15 seconds' WHERE id=$1", run)
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.fetchval('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE', cid)
                    task = asyncio.create_task(FencedDB(pool, run, lease).complete(cid, 'answer'))
                    await asyncio.sleep(.3)
                with pytest.raises(RunExpired):
                    await task
    asyncio.run(scenario())


def test_fenced_write_rechecks_lease_after_run_lock_wait():
    import os
    import pytest
    import test_attachments_postgres as fixtures
    from runs import FencedDB, RunExpired
    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated database not configured')
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            run, lease, _ = await ConversationRepository(pool, tenant, user).begin_run(cid, 'first')
            await pool.execute("UPDATE chat_response_runs SET lease_until=clock_timestamp()+interval '0.15 seconds' WHERE id=$1", run)
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.fetchval('SELECT id FROM chat_response_runs WHERE id=$1 FOR UPDATE', run)
                    task = asyncio.create_task(FencedDB(pool, run, lease).fetchrow('SELECT 1'))
                    await asyncio.sleep(.3)
                with pytest.raises(RunExpired):
                    await task
    asyncio.run(scenario())


def test_heartbeat_cannot_revive_a_lease_after_lock_wait():
    import os
    import pytest
    import test_attachments_postgres as fixtures
    from runs import FencedDB
    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated database not configured')
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            run, lease, _ = await ConversationRepository(pool, tenant, user).begin_run(cid, 'first')
            await pool.execute("UPDATE chat_response_runs SET lease_until=clock_timestamp()+interval '0.15 seconds' WHERE id=$1", run)
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.fetchval('SELECT id FROM chat_response_runs WHERE id=$1 FOR UPDATE', run)
                    task = asyncio.create_task(FencedDB(pool, run, lease).heartbeat())
                    await asyncio.sleep(.3)
                assert not await task
    asyncio.run(scenario())


def test_compaction_cannot_prune_a_message_with_active_run():
    import os
    import pytest
    import test_attachments_postgres as fixtures
    from memory import consolidate
    from attachment_repository import AttachmentRepository
    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated database not configured')
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            run1, lease1, first = await repo.begin_run(cid, 'first')
            from runs import FencedDB
            await FencedDB(pool, run1, lease1).complete(cid, 'answer')
            _, _, second = await repo.begin_run(cid, 'second')
            async def summary(_facts, _messages):
                return '{"facts":[{"topic":"test","text":"safe"}]}'
            assert not await consolidate(pool, cid, summary, min_responses=1, message_repository=AttachmentRepository(pool, tenant, user))
            assert await pool.fetchval('SELECT count(*) FROM chat_messages WHERE id=ANY($1::uuid[])', [first, second]) == 2
    asyncio.run(scenario())


def test_completed_interleaved_turns_can_be_safely_compacted():
    import os
    import pytest
    import test_attachments_postgres as fixtures
    from memory import consolidate
    from attachment_repository import AttachmentRepository
    from runs import FencedDB
    if not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'):
        pytest.skip('isolated database not configured')
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            a, al, _ = await repo.begin_run(cid, 'first')
            b, bl, _ = await repo.begin_run(cid, 'second')
            await FencedDB(pool, b, bl).complete(cid, 'answer second')
            await FencedDB(pool, a, al).complete(cid, 'answer first')
            seen = []
            async def summary(_facts, messages):
                seen.extend(row['content'] for row in messages)
                return '{"facts":[{"topic":"test","text":"safe"}]}'
            assert await consolidate(pool, cid, summary, min_responses=2, message_repository=AttachmentRepository(pool, tenant, user))
            assert seen == ['first', 'second', 'answer second', 'answer first']
    asyncio.run(scenario())


def test_postgres_duplicate_send_key_never_creates_second_turn():
    import pytest
    import test_attachments_postgres as fixtures
    from attachment_repository import ConversationError
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            key = uuid4()
            async def send():
                try:
                    return await repo.begin_run(cid, 'same', client_key=key)
                except ConversationError as error:
                    return error.status_code
            results = await asyncio.gather(send(), send())
            assert sum(result == 409 for result in results) == 1
            assert await pool.fetchval('SELECT count(*) FROM chat_messages WHERE conversation_id=$1', cid) == 1
            assert await pool.fetchval('SELECT client_key FROM chat_response_runs WHERE conversation_id=$1', cid) == key
    asyncio.run(scenario())


def test_postgres_key_survives_message_pruning():
    import test_attachments_postgres as fixtures
    from attachment_repository import ConversationError
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            key = uuid4()
            _, _, mid = await repo.begin_run(cid, 'first', client_key=key)
            await pool.execute('DELETE FROM chat_messages WHERE id=$1', mid)
            try:
                await repo.begin_run(cid, 'first', client_key=key)
                assert False, 'duplicate accepted after pruning'
            except ConversationError as error:
                assert error.status_code == 409
    asyncio.run(scenario())


def test_postgres_retry_key_is_single_use_and_scoped_to_owned_conversation():
    import pytest
    import test_attachments_postgres as fixtures
    from attachment_repository import ConversationError
    async def scenario():
        async with fixtures.database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            original, _, mid = await repo.begin_run(cid, 'first', client_key=uuid4())
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", original)
            key = uuid4()
            retried, _, reused = await repo.begin_run(cid, retry=True, retry_run_id=original, client_key=key)
            assert reused == mid and retried != original
            with pytest.raises(ConversationError) as duplicate:
                await repo.begin_run(cid, retry=True, retry_run_id=original, client_key=key)
            assert duplicate.value.status_code == 409
            assert await pool.fetchval('SELECT count(*) FROM chat_response_runs WHERE conversation_id=$1', cid) == 2
            other = await pool.fetchval("INSERT INTO chat_conversations(tenant_id,user_id,title) VALUES($1,$2,'Other') RETURNING id", tenant, user)
            await repo.begin_run(other, 'different', client_key=key)
            with pytest.raises(ConversationError) as denied:
                await ConversationRepository(pool, tenant, uuid4()).begin_run(cid, 'no', client_key=uuid4())
            assert denied.value.status_code == 404
    asyncio.run(scenario())
