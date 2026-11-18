"""Integration tests use an explicitly disposable PostgreSQL database."""
import asyncio
from pathlib import Path
from uuid import uuid4

import pytest

from conversation_repository import ConversationRepository
from guided_setup_persistence import GuidedSetupPersistence, SnapshotMissing, StaleSetupTurn
from runs import RunExpired
from test_attachments_postgres import database, URL

pytestmark = pytest.mark.skipif(not URL, reason='CHAT_MEDIA_TEST_DATABASE_URL isolado ausente')
MIGRATIONS = Path(__file__).resolve().parents[3] / 'packages/db/migrations'


async def prepare(pool, tenant, user, cid):
    for name in ('0084_chat_guided_setups.sql', '0085_chat_guided_setup_receipts.sql'):
        await pool.execute((MIGRATIONS / name).read_text())
    run, lease, mid = await ConversationRepository(pool, tenant, user).begin_run(cid, 'Sim')
    return GuidedSetupPersistence(pool, tenant, user, cid, run, lease, mid), run, mid


def test_retry_after_commit_and_before_commit_are_idempotent():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            setup, run, mid = await prepare(pool, tenant, user, cid)
            assert (await setup.capture_snapshot()).step == 'invitation'
            with pytest.raises(ValueError):
                await setup.save_answer('inválida')
            assert await pool.fetchval('SELECT step FROM chat_guided_setups') == 'invitation'
            first = await setup.save_answer('Sim')
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", run)
            run2, lease2, mid2 = await ConversationRepository(pool, tenant, user).begin_run(cid, retry=True)
            assert mid2 == mid
            retried = GuidedSetupPersistence(pool, tenant, user, cid, run2, lease2, mid)
            assert (await retried.capture_snapshot()).step == 'invitation'
            assert await retried.save_answer('Sim') == {**first, 'replayed': True}
            assert (await retried.current()).step == 'business_name'
            with pytest.raises(RunExpired):
                await setup.save_answer('Sim')
    asyncio.run(scenario())


@pytest.mark.parametrize('field', range(6))
def test_wrong_scope_and_fence_rejected(field):
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            setup, run, mid = await prepare(pool, tenant, user, cid)
            values = [tenant, user, cid, run, setup.lease_id, mid]
            values[field] = uuid4()
            bad = GuidedSetupPersistence(pool, *values)
            with pytest.raises(RunExpired):
                await bad.save_answer('Sim')
            assert await pool.fetchval('SELECT count(*) FROM chat_guided_setups') == 0
    asyncio.run(scenario())


def test_concurrent_turns_for_same_tenant_user_are_serialized():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            first, _, _ = await prepare(pool, tenant, user, cid)
            cid2 = await pool.fetchval(
                "INSERT INTO chat_conversations(tenant_id,user_id,title) VALUES($1,$2,'Outra') RETURNING id",
                tenant, user)
            run, lease, mid = await ConversationRepository(pool, tenant, user).begin_run(cid2, 'Sim')
            second = GuidedSetupPersistence(pool, tenant, user, cid2, run, lease, mid)
            await asyncio.gather(first.capture_snapshot(), second.capture_snapshot())
            results = await asyncio.gather(first.save_answer('Sim'), second.save_answer('Sim'), return_exceptions=True)
            assert sum(isinstance(result, StaleSetupTurn) for result in results) == 1
            assert [result['step'] for result in results if isinstance(result, dict)] == ['business_name']
            assert (await first.current()).answers == {}
    asyncio.run(scenario())


def test_lease_expiring_while_waiting_for_user_lock_rolls_back():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            setup, run, _ = await prepare(pool, tenant, user, cid)
            await pool.execute("""INSERT INTO chat_guided_setups(tenant_id,user_id,step)
                                  VALUES($1,$2,'invitation')""", tenant, user)
            await setup.capture_snapshot()
            async with pool.acquire() as blocker:
                async with blocker.transaction():
                    await blocker.fetchval('SELECT 1 FROM chat_guided_setups WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE', tenant, user)
                    await pool.execute("UPDATE chat_response_runs SET lease_until=clock_timestamp()+interval '0.2 second' WHERE id=$1", run)
                    task = asyncio.create_task(setup.save_answer('Sim'))
                    await asyncio.sleep(0.4)
            with pytest.raises(RunExpired):
                await task
            assert await pool.fetchval('SELECT step FROM chat_guided_setups WHERE tenant_id=$1 AND user_id=$2', tenant, user) == 'invitation'
            assert await pool.fetchval('SELECT count(*) FROM chat_guided_setup_receipts') == 0
    asyncio.run(scenario())


def test_old_retry_without_snapshot_cannot_create_one_or_advance():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            setup, run, mid = await prepare(pool, tenant, user, cid)
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", run)
            run2, lease2, mid2 = await ConversationRepository(pool, tenant, user).begin_run(cid, retry=True)
            retry = GuidedSetupPersistence(pool, tenant, user, cid, run2, lease2, mid2)
            with pytest.raises(SnapshotMissing):
                await retry.capture_snapshot()
            with pytest.raises(SnapshotMissing):
                await retry.save_answer('Sim')
            assert await pool.fetchval('SELECT count(*) FROM chat_guided_setup_receipts') == 0
    asyncio.run(scenario())


def test_snapshot_first_write_wins_and_unapplied_old_turn_is_stale_after_other_turn():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            old, run, mid = await prepare(pool, tenant, user, cid)
            assert (await old.capture_snapshot()).step == 'invitation'
            cid2 = await pool.fetchval("INSERT INTO chat_conversations(tenant_id,user_id,title) VALUES($1,$2,'Outra') RETURNING id", tenant, user)
            r2, l2, m2 = await ConversationRepository(pool, tenant, user).begin_run(cid2, 'Sim')
            newer = GuidedSetupPersistence(pool, tenant, user, cid2, r2, l2, m2)
            await newer.capture_snapshot()
            await newer.save_answer('Sim')
            assert (await old.capture_snapshot()).step == 'invitation'
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", run)
            r3, l3, m3 = await ConversationRepository(pool, tenant, user).begin_run(cid, retry=True)
            retry = GuidedSetupPersistence(pool, tenant, user, cid, r3, l3, m3)
            assert (await retry.capture_snapshot()).step == 'invitation'
            with pytest.raises(StaleSetupTurn):
                await retry.save_answer('Sim')
            assert (await retry.current()).step == 'business_name'
            assert (await retry.current()).answers == {}
    asyncio.run(scenario())


def test_receipt_replays_even_after_later_turn_changes_state():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            first, _, _ = await prepare(pool, tenant, user, cid)
            await first.capture_snapshot()
            original = await first.save_answer('Sim')
            cid2 = await pool.fetchval("INSERT INTO chat_conversations(tenant_id,user_id,title) VALUES($1,$2,'Outra') RETURNING id", tenant, user)
            r2, l2, m2 = await ConversationRepository(pool, tenant, user).begin_run(cid2, 'Loja')
            second = GuidedSetupPersistence(pool, tenant, user, cid2, r2, l2, m2)
            await second.capture_snapshot()
            await second.save_answer('Loja')
            assert await first.save_answer(None) == {**original, 'replayed': True}
            assert (await first.current()).step == 'logo'
    asyncio.run(scenario())


def test_retry_before_write_uses_snapshot_when_state_unchanged():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            original, run, mid = await prepare(pool, tenant, user, cid)
            await original.capture_snapshot()
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", run)
            r2, lease, m2 = await ConversationRepository(pool, tenant, user).begin_run(cid, retry=True)
            assert m2 == mid
            retry = GuidedSetupPersistence(pool, tenant, user, cid, r2, lease, m2)
            assert (await retry.capture_snapshot()).step == 'invitation'
            assert (await retry.save_answer('Sim'))['step'] == 'business_name'
    asyncio.run(scenario())


def test_retry_before_offering_write_updates_profile_once():
    from guided_setup import GuidedSetupTools

    async def scenario():
        async with database() as (pool, tenant, user, cid):
            original, run, mid = await prepare(pool, tenant, user, cid)
            await pool.execute('''INSERT INTO chat_guided_setups(tenant_id,user_id,step,answers)
                VALUES($1,$2,'offering',$3::jsonb)''', tenant, user, '{"businessName":"Loja"}')
            await original.capture_snapshot()
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", run)
            new_run, lease, _ = await ConversationRepository(pool, tenant, user).begin_run(cid, retry=True)
            resumed = GuidedSetupPersistence(pool, tenant, user, cid, new_run, lease, mid)
            await resumed.capture_snapshot()
            calls = []
            async def writer(*values):
                calls.append(values)
                return {}
            tool = GuidedSetupTools(resumed, writer)
            assert (await tool.guided_setup_answer('Café'))['contextSaved'] is True
            assert (await tool.guided_setup_answer('Café'))['contextUncertain'] is True
            assert calls == [('Loja', 'Produtos ou serviços: Café')]
    asyncio.run(scenario())


def test_missing_optional_setup_table_keeps_status_available_but_never_claims_a_saved_answer():
    import asyncpg

    async def scenario():
        async with database() as (pool, tenant, user, cid):
            run, lease, mid = await ConversationRepository(pool, tenant, user).begin_run(cid, 'Sim')
            setup = GuidedSetupPersistence(pool, tenant, user, cid, run, lease, mid)
            assert (await setup.current()).step == 'invitation'
            with pytest.raises(asyncpg.UndefinedTableError):
                await setup.save_answer('Sim')
    asyncio.run(scenario())


def test_missing_receipt_migration_never_advances_setup():
    import asyncpg

    async def scenario():
        async with database() as (pool, tenant, user, cid):
            await pool.execute((MIGRATIONS / '0084_chat_guided_setups.sql').read_text())
            run, lease, mid = await ConversationRepository(pool, tenant, user).begin_run(cid, 'Sim')
            setup = GuidedSetupPersistence(pool, tenant, user, cid, run, lease, mid)
            with pytest.raises(asyncpg.UndefinedTableError):
                await setup.capture_snapshot()
            assert (await setup.current()).step == 'invitation'
            assert await pool.fetchval('SELECT count(*) FROM chat_guided_setups') == 0
    asyncio.run(scenario())
