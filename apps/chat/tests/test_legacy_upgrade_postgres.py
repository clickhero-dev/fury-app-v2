"""Upgrade pre-0072 data in an isolated PostgreSQL schema."""
import asyncio
import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest

from attachment_repository import AttachmentRepository
from conversation_repository import ConversationRepository
from test_attachments_postgres import database, attach

URL = os.getenv('CHAT_MEDIA_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='isolated PostgreSQL URL required')


def test_legacy_upgrade_history_and_attachment_causality():
    async def scenario():
        # Build the pre-0072 state with the real migrations in a disposable schema.
        async with database() as (pool, tenant, user, cid):
            async with pool.acquire() as conn:
                await conn.execute('DROP TABLE chat_send_keys; DROP INDEX chat_response_runs_message_running; DROP INDEX chat_response_runs_running; DROP INDEX chat_response_runs_client_key; ALTER TABLE chat_response_runs DROP COLUMN assistant_message_id, DROP COLUMN client_key; CREATE UNIQUE INDEX chat_response_runs_active ON chat_response_runs(conversation_id) WHERE status=\'running\'')
                async def message(role, content, seconds):
                    return await conn.fetchval("INSERT INTO chat_messages(conversation_id,role,content,created_at) VALUES($1,$2,$3, '2024-01-01'::timestamptz + $4 * interval '1 second') RETURNING id", cid, role, content, seconds)
                async def run(mid, status, seconds):
                    return await conn.fetchval("INSERT INTO chat_response_runs(conversation_id,user_message_id,lease_id,status,lease_until,created_at,updated_at) VALUES($1,$2,$3,$4,'2024-01-02', '2024-01-01'::timestamptz + $5 * interval '1 second', '2024-01-01'::timestamptz + ($5+1) * interval '1 second') RETURNING id", cid, mid, uuid4(), status, seconds)
                u1 = await message('user', 'first', 1); r1 = await run(u1, 'completed', 2); a1 = await message('assistant', 'one', 3)
                u2 = await message('user', 'second', 4); r2 = await run(u2, 'completed', 5); a2 = await message('assistant', 'two', 6)
                u3 = await message('user', 'ambiguous', 7); r3 = await run(u3, 'completed', 8)
                await message('assistant', 'candidate one', 9); await message('assistant', 'candidate two', 10)
                u4 = await message('user', 'interrupted', 11); await run(u4, 'interrupted', 12)
                retry_user = await message('user', 'retry', 13)
                failed_run = await run(retry_user, 'failed', 14)
                retry_run = await run(retry_user, 'completed', 16)
                retry_answer = await message('assistant', 'retry answer', 17)
                target = await message('user', 'target', 18)
                retry_attachment = await attach(pool, tenant, user, cid, filename='retry.png')
                await conn.execute('UPDATE chat_attachments SET message_id=$1 WHERE id=$2', retry_user, retry_attachment)
                attachment = await attach(pool, tenant, user, cid)
                valid_attachment = await attach(pool, tenant, user, cid, filename='legacy.png')
                await conn.execute('UPDATE chat_attachments SET message_id=$1 WHERE id=$2', u3, attachment)
                await conn.execute('UPDATE chat_attachments SET message_id=$1 WHERE id=$2', u1, valid_attachment)
                migration = Path(__file__).resolve().parents[3] / 'packages/db/migrations/0072_chat_concurrent_runs.sql'
                await conn.execute(migration.read_text())
                assert await conn.fetchval('SELECT assistant_message_id FROM chat_response_runs WHERE id=$1', r1) == a1
                assert await conn.fetchval('SELECT assistant_message_id FROM chat_response_runs WHERE id=$1', r2) == a2
                assert await conn.fetchval('SELECT assistant_message_id FROM chat_response_runs WHERE id=$1', r3) is None
                assert await conn.fetchval('SELECT assistant_message_id FROM chat_response_runs WHERE id=$1', failed_run) is None
                assert await conn.fetchval('SELECT assistant_message_id FROM chat_response_runs WHERE id=$1', retry_run) == retry_answer
                history = await ConversationRepository(pool, tenant, user).history(cid, target)
                ids = {row['id'] for row in history}
                assert {u1, u2, retry_user, retry_answer, target} <= ids
                assert u3 not in ids and u4 not in ids
                attachments = AttachmentRepository(pool, tenant, user)
                assert {row['id'] for row in await attachments.associated(cid, through_message_id=target)} == {valid_attachment, retry_attachment}
                assert await attachments.associated(cid, through_message_id=u1)  # current turn's own attachment
                assert await attachments.associated(cid, through_message_id=u2)  # completed first turn
                # Re-running the migration must not reinterpret post-upgrade rows.
                late = await message('user', 'post-upgrade', 20)
                late_run = await run(late, 'completed', 21)
                await message('assistant', 'post-upgrade answer', 22)
                await conn.execute(migration.read_text())
                assert await conn.fetchval('SELECT assistant_message_id FROM chat_response_runs WHERE id=$1', late_run) is None
    asyncio.run(scenario())


@pytest.mark.parametrize('other_status,other_updated,expected', [
    ('completed', 3, False),
    ('running', 3, False),
    ('failed', 5, False),  # equal timestamps cannot establish ordering
    ('failed', 6, False),  # overlaps the retry
    ('interrupted', 4, True),
])
def test_retry_backfill_requires_unambiguous_previous_attempt(other_status, other_updated, expected):
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            async with pool.acquire() as conn:
                await conn.execute("DROP TABLE chat_send_keys; DROP INDEX chat_response_runs_message_running; DROP INDEX chat_response_runs_running; DROP INDEX chat_response_runs_client_key; ALTER TABLE chat_response_runs DROP COLUMN assistant_message_id, DROP COLUMN client_key")
                mid = await conn.fetchval("INSERT INTO chat_messages(conversation_id,role,content,created_at) VALUES($1,'user','question','2024-01-01 00:00:01+00') RETURNING id", cid)
                async def add_run(status, created, updated):
                    return await conn.fetchval("INSERT INTO chat_response_runs(conversation_id,user_message_id,lease_id,status,lease_until,created_at,updated_at) VALUES($1,$2,$3,$4,'2024-01-02','2024-01-01'::timestamptz + $5 * interval '1 second','2024-01-01'::timestamptz + $6 * interval '1 second') RETURNING id", cid, mid, uuid4(), status, created, updated)
                await add_run(other_status, 2, other_updated)
                retry = await add_run('completed', 5, 6)
                answer = await conn.fetchval("INSERT INTO chat_messages(conversation_id,role,content,created_at) VALUES($1,'assistant','answer','2024-01-01 00:00:06+00') RETURNING id", cid)
                migration = Path(__file__).resolve().parents[3] / 'packages/db/migrations/0072_chat_concurrent_runs.sql'
                await conn.execute(migration.read_text())
                result = await conn.fetchval('SELECT assistant_message_id FROM chat_response_runs WHERE id=$1', retry)
                assert result == (answer if expected else None)
    asyncio.run(scenario())
