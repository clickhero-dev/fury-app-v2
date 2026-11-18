import asyncio
from pathlib import Path
from uuid import uuid4
import os

import asyncpg
import httpx
import pytest
from streaming import ProviderRunError

from turn_recovery import TurnRecovery, transient_failure
from attachment_repository import ConversationError


def test_only_explicit_transient_errors_recover():
    assert transient_failure(httpx.ReadTimeout('timeout'))
    assert transient_failure(httpx.ConnectError('network'))
    assert not transient_failure(ValueError('invalid'))
    assert transient_failure(ProviderRunError('transient'))
    assert not transient_failure(ProviderRunError('auth'))
    assert not transient_failure(httpx.HTTPStatusError('auth', request=httpx.Request('GET', 'https://x'), response=httpx.Response(401)))


@pytest.mark.skipif(not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'), reason='isolated PostgreSQL required')
def test_durable_restart_concurrency_budget_cancel_and_deadline():
    async def scenario():
        url = os.environ['CHAT_MEDIA_TEST_DATABASE_URL']
        schema = 'recovery_' + uuid4().hex
        conn = await asyncpg.connect(url)
        await conn.execute(f'CREATE SCHEMA {schema}')
        pool = None
        try:
            await conn.execute(f'SET search_path TO {schema}')
            await conn.execute('''CREATE TABLE chat_conversations(id uuid PRIMARY KEY,tenant_id uuid,user_id uuid);
                CREATE TABLE chat_response_runs(id uuid PRIMARY KEY,conversation_id uuid,user_message_id uuid,lease_id uuid,status text,lease_until timestamptz,created_at timestamptz DEFAULT clock_timestamp(),updated_at timestamptz);
            ''')
            migration = Path(__file__).parents[3] / 'packages/db/migrations/0081_chat_turn_recovery.sql'
            await conn.execute(migration.read_text())
            pool = await asyncpg.create_pool(url, min_size=1, max_size=4, server_settings={'search_path': schema})
            cid, tid, uid, mid, rid, lid = [uuid4() for _ in range(6)]
            await conn.execute('INSERT INTO chat_conversations VALUES($1,$2,$3)',cid,tid,uid)
            await conn.execute("INSERT INTO chat_response_runs(id,conversation_id,user_message_id,lease_id,status,lease_until) VALUES($1,$2,$3,$4,'running',now()+interval '45 seconds')",rid,cid,mid,lid)
            recovery = TurnRecovery(pool,tid,uid)
            await recovery.register(conn,cid,mid)
            await recovery.finish(rid,lid,transient=True)
            await conn.execute('UPDATE chat_turn_recovery SET next_attempt_at=clock_timestamp()')
            # New repository/process sees authoritative state, no in-memory queue.
            recovered = TurnRecovery(pool,tid,uid)
            async def claim():
                async with pool.acquire() as c:
                    async with c.transaction():
                        return await recovered.claim(c,cid,mid)
            results = await asyncio.gather(claim(), claim(), return_exceptions=True)
            assert sum(result is None for result in results) == 1
            assert sum(isinstance(result,ConversationError) for result in results) == 1
            assert await conn.fetchval('SELECT attempts FROM chat_turn_recovery') == 1
            await conn.execute("UPDATE chat_response_runs SET status='running'")
            await recovered.charge(mid,rid,lid,100)
            assert await conn.fetchval('SELECT provider_requests FROM chat_turn_recovery') == 1
            await conn.execute('UPDATE chat_turn_recovery SET provider_requests=max_provider_requests')
            with pytest.raises(ConversationError):
                await recovered.charge(mid,rid,lid,100)
            with pytest.raises(ConversationError):
                await TurnRecovery(pool,tid,uuid4()).cancel(cid,rid)
            await recovered.cancel(cid,rid)
            with pytest.raises(ConversationError):
                await recovered.charge(mid,rid,lid,100)
            assert await conn.fetchval('SELECT status FROM chat_turn_recovery') == 'cancelled'
            assert await conn.fetchval('SELECT status FROM chat_response_runs') == 'interrupted'
            await conn.execute("UPDATE chat_turn_recovery SET status='stopped'")
            await recovered.cancel(cid,rid)
            assert await conn.fetchval('SELECT status FROM chat_turn_recovery') == 'cancelled'
            await conn.execute("UPDATE chat_turn_recovery SET status='queued',deadline_at=now()-interval '1 second'")
            with pytest.raises(ConversationError):
                await claim()
            # Safe post-response title/summary requests still share the original
            # operation budget; no new turn budget is minted for auxiliaries.
            await conn.execute("UPDATE chat_turn_recovery SET status='completed',deadline_at=now()+interval '1 minute',provider_requests=0")
            await conn.execute("UPDATE chat_response_runs SET status='completed',lease_until=now()+interval '45 seconds'")
            await recovered.charge(mid,rid,lid,100)
            assert await conn.fetchval('SELECT provider_requests FROM chat_turn_recovery') == 1
            assert await recovered.cancel(cid,rid) == {'status':'completed'}
            assert await conn.fetchval('SELECT status FROM chat_turn_recovery') == 'completed'
        finally:
            if pool: await pool.close()
            await conn.execute(f'DROP SCHEMA {schema} CASCADE')
            await conn.close()
    asyncio.run(scenario())
