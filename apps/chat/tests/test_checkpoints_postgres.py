"""Real PostgreSQL: causal retry, lease fences, compaction and owner isolation."""
import asyncio
from pathlib import Path
from uuid import uuid4

import pytest

from checkpoints import CACHE_MISS, CheckpointRepository
from conversation_repository import ConversationRepository
from runs import RunExpired
from test_attachments_postgres import database, URL

pytestmark = pytest.mark.skipif(not URL, reason='CHAT_MEDIA_TEST_DATABASE_URL isolado ausente')
MIGRATION = Path(__file__).resolve().parents[3] / 'packages/db/migrations/0080_chat_turn_checkpoints.sql'


async def setup(pool, tenant, user, cid):
    await pool.execute(MIGRATION.read_text())
    run, lease, mid = await ConversationRepository(pool, tenant, user).begin_run(cid, 'Pergunta')
    return CheckpointRepository(pool, tenant, user, cid, run, lease, mid), run, lease, mid


def test_retry_recovers_first_context_and_only_confirmed_reads():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo, run, _, mid = await setup(pool, tenant, user, cid)
            await repo.save_context(['política', {'summary': 'original'}], [{'content': 'causal'}])
            await repo.save_context(['novo resumo incorreto'], [])
            await repo.record_tool('brand', {}, {'data': {'name': 'Marca'}})
            await repo.record_tool('brand', {}, {'data': {'name': 'não substituir'}})
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", run)
            newer, lease, reused = await ConversationRepository(pool, tenant, user).begin_run(cid, retry=True)
            assert reused == mid
            retry = CheckpointRepository(pool, tenant, user, cid, newer, lease, mid)
            assert await retry.load_context() == (['política', {'summary': 'original'}], [{'content': 'causal'}])
            assert await retry.cached_tool('brand', {}) == {'data': {'name': 'Marca'}}
            assert await retry.cached_tool('profile', {}) is CACHE_MISS
            for operation in (repo.load_context(), repo.save_context([], []), repo.record_tool('profile', {}, {})):
                with pytest.raises(RunExpired):
                    await operation
    asyncio.run(scenario())


@pytest.mark.parametrize('field', ['tenant', 'user', 'conversation', 'run', 'lease', 'message', 'expired', 'completed'])
def test_owner_and_fence_reject_every_wrong_scope(field):
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo, run, lease, mid = await setup(pool, tenant, user, cid)
            await repo.save_context(['original'], [])
            values = [tenant, user, cid, run, lease, mid]
            if field in ('expired', 'completed'):
                query = ("UPDATE chat_response_runs SET lease_until=now()-interval '1 second' WHERE id=$1"
                         if field == 'expired' else "UPDATE chat_response_runs SET status='completed' WHERE id=$1")
                await pool.execute(query, run)
            else:
                values[['tenant', 'user', 'conversation', 'run', 'lease', 'message'].index(field)] = uuid4()
            invalid = CheckpointRepository(pool, *values)
            with pytest.raises(RunExpired):
                await invalid.load_context()
            with pytest.raises(RunExpired):
                await invalid.save_context(['bad'], [])
            with pytest.raises(RunExpired):
                await invalid.record_tool('brand', {}, {})
            with pytest.raises(RunExpired):
                await invalid.cached_tool('brand', {})
    asyncio.run(scenario())


def test_message_and_run_compaction_preserves_snapshot_but_conversation_deletion_cascades():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo, run, _, mid = await setup(pool, tenant, user, cid)
            await repo.save_context(['original'], [])
            await repo.record_tool('brand', {}, None)
            await pool.execute('DELETE FROM chat_messages WHERE id=$1', mid)
            assert await pool.fetchval('SELECT count(*) FROM chat_response_runs WHERE id=$1', run) == 0
            assert await pool.fetchval('SELECT count(*) FROM chat_turn_checkpoints WHERE conversation_id=$1 AND user_message_id=$2', cid, mid) == 1
            assert await pool.fetchval('SELECT count(*) FROM chat_tool_checkpoints WHERE conversation_id=$1', cid) == 1
            with pytest.raises(RunExpired):
                await repo.load_context()
            await pool.execute('DELETE FROM chat_conversations WHERE id=$1', cid)
            assert await pool.fetchval('SELECT count(*) FROM chat_turn_checkpoints') == 0
            assert await pool.fetchval('SELECT count(*) FROM chat_tool_checkpoints') == 0
    asyncio.run(scenario())
