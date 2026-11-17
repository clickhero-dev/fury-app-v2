import asyncio
import os
import pytest

from plan_tools import PlanTools


def test_run_plan_creation_disabled_without_remote_fence():
    class Client:
        async def send(self, *_args, **_kwargs):
            raise AssertionError('unfenced HTTP must not be sent')
    plans = PlanTools('https://example.com', 'token', Client(), '123e4567-e89b-12d3-a456-426614174000', allow_create=False)
    result = asyncio.run(plans.create_plan('title', 'goal', [{'key': 'a', 'title': 'a', 'capability': 'read_brand', 'parameters': {}, 'dependsOn': []}]))
    assert result['code'] == 'unavailable'


@pytest.mark.skipif(not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'), reason='isolated database not configured')
def test_postgres_preflight_compacts_only_for_current_valid_lease():
    import test_attachments_postgres as fixtures
    from conversation_repository import ConversationRepository
    from attachment_repository import AttachmentRepository
    from memory import consolidate
    from runs import FencedDB
    async def run():
        async with fixtures.database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            r, lease, _ = await repo.begin_run(cid, 'old')
            await FencedDB(pool, r, lease).complete(cid, 'answer')
            current, current_lease, current_message = await repo.begin_run(cid, 'new')
            async def summary(*_): return '{"facts":[{"topic":"old","text":"answer"}]}'
            kwargs = dict(min_responses=1, message_repository=AttachmentRepository(pool, tenant, user), owner_run=(current, current_lease, current_message))
            assert await consolidate(pool, cid, summary, **kwargs)
            assert await pool.fetchval('SELECT count(*) FROM chat_messages WHERE id=$1', current_message) == 1
    asyncio.run(run())


@pytest.mark.skipif(not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'), reason='isolated database not configured')
def test_postgres_legacy_unlinked_run_is_not_trusted_for_causal_history():
    import test_attachments_postgres as fixtures
    from conversation_repository import ConversationRepository
    async def run():
        async with fixtures.database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            old, _, _ = await repo.begin_run(cid, 'old unknown completion')
            await pool.execute("UPDATE chat_response_runs SET status='completed' WHERE id=$1", old)
            _, _, current = await repo.begin_run(cid, 'current')
            assert [x['content'] for x in await repo.history(cid, current)] == ['current']
    asyncio.run(run())


@pytest.mark.skipif(not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'), reason='isolated database not configured')
def test_postgres_retry_refuses_unversioned_compacted_memory():
    import pytest
    import test_attachments_postgres as fixtures
    from conversation_repository import ConversationRepository
    from attachment_repository import ConversationError
    async def run():
        async with fixtures.database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            old, _, _ = await repo.begin_run(cid, 'old')
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", old)
            await pool.execute('INSERT INTO chat_memories(conversation_id,facts) VALUES($1,$2::jsonb)', cid, '[{"topic":"future","text":"future"}]')
            with pytest.raises(ConversationError) as err:
                await repo.begin_run(cid, retry=True, retry_run_id=old)
            assert err.value.status_code == 409
    asyncio.run(run())


@pytest.mark.skipif(not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'), reason='isolated database not configured')
def test_postgres_preflight_rejects_other_active_or_expired_owner():
    import test_attachments_postgres as fixtures
    from conversation_repository import ConversationRepository
    from attachment_repository import AttachmentRepository
    from memory import consolidate
    from runs import FencedDB
    async def run():
        async with fixtures.database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            old, lease, old_message = await repo.begin_run(cid, 'old')
            await FencedDB(pool, old, lease).complete(cid, 'answer')
            owner, owner_lease, msg = await repo.begin_run(cid, 'current')
            other, _, _ = await repo.begin_run(cid, 'other')
            async def summary(*_): return '{"facts":[{"topic":"old","text":"answer"}]}'
            options = dict(min_responses=1, message_repository=AttachmentRepository(pool, tenant, user), owner_run=(owner, owner_lease, msg))
            assert not await consolidate(pool, cid, summary, **options)
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", other)
            await pool.execute("UPDATE chat_response_runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", owner)
            assert not await consolidate(pool, cid, summary, **options)
            assert await pool.fetchval('SELECT 1 FROM chat_messages WHERE id=$1', old_message)
    asyncio.run(run())


@pytest.mark.skipif(not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'), reason='isolated database not configured')
def test_postgres_preflight_does_not_summarize_future_turns_on_retry():
    import test_attachments_postgres as fixtures
    from conversation_repository import ConversationRepository
    from attachment_repository import AttachmentRepository
    from memory import consolidate
    from runs import FencedDB
    async def run():
        async with fixtures.database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            first, _, first_msg = await repo.begin_run(cid, 'first')
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", first)
            later, lease, _ = await repo.begin_run(cid, 'later')
            await FencedDB(pool, later, lease).complete(cid, 'later answer')
            retry, retry_lease, _ = await repo.begin_run(cid, retry=True, retry_run_id=first)
            async def summary(*_): raise AssertionError('future history must not be summarized')
            assert not await consolidate(pool, cid, summary, min_responses=1, message_repository=AttachmentRepository(pool, tenant, user), owner_run=(retry, retry_lease, first_msg))
    asyncio.run(run())
