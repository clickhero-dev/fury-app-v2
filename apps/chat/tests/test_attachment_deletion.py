"""Funcionalidade: cleanup privado antes de excluir metadados, sob fence da conversa."""
import asyncio

import httpx
import pytest
from uuid import uuid4

from attachment_repository import ConversationError
from conversation_repository import ConversationRepository
from test_attachments_postgres import URL, database, attach

pytestmark = pytest.mark.skipif(not URL, reason='CHAT_MEDIA_TEST_DATABASE_URL isolado ausente')


# Dado cleanup que falha, quando exclui, então conserva histórico/vínculo e permite repetir.
def test_delete_cleanup_failure_preserves_rows_and_success_removes_them():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            aid = await attach(pool, tenant, user, cid)
            repo = ConversationRepository(pool, tenant, user)
            run, _, mid = await repo.begin_run(cid, '', attachment_ids=[aid])
            await pool.execute("UPDATE chat_response_runs SET status='completed' WHERE id=$1", run)
            async def fail(): raise httpx.ReadTimeout('storage unavailable')
            with pytest.raises(httpx.ReadTimeout):
                await repo.delete(cid, fail)
            assert await pool.fetchval('SELECT message_id FROM chat_attachments WHERE id=$1', aid) == mid
            assert await pool.fetchval('SELECT count(*) FROM chat_conversations WHERE id=$1', cid) == 1
            called = []
            async def clean():
                called.append(True)
                assert await pool.fetchval('SELECT count(*) FROM chat_attachments WHERE id=$1', aid) == 1
            await repo.delete(cid, clean)
            assert called == [True]
            assert await pool.fetchval('SELECT count(*) FROM chat_conversations WHERE id=$1', cid) == 0
            assert await pool.fetchval('SELECT count(*) FROM chat_attachments WHERE id=$1', aid) == 0
            assert await pool.fetchval('SELECT count(*) FROM chat_messages WHERE id=$1', mid) == 0
    asyncio.run(scenario())


# Dado run ativo ou outro dono, então recusa antes de chamar storage; legado não precisa dele.
def test_delete_denies_running_and_foreign_owner_and_skips_cleanup_for_legacy():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            async def unexpected(): raise AssertionError('Não pode limpar')
            with pytest.raises(ConversationError) as foreign:
                await ConversationRepository(pool, tenant, uuid4()).delete(cid, unexpected)
            assert foreign.value.status_code == 404
            run, _, _ = await repo.begin_run(cid, 'Texto legado')
            with pytest.raises(ConversationError) as busy:
                await repo.delete(cid, unexpected)
            assert busy.value.status_code == 409
            await pool.execute("UPDATE chat_response_runs SET status='completed' WHERE id=$1", run)
            await repo.delete(cid, unexpected)
            assert await pool.fetchval('SELECT count(*) FROM chat_conversations WHERE id=$1', cid) == 0
    asyncio.run(scenario())


# Dado cleanup em curso, quando associação compete, então ela espera e perde sem órfão.
def test_delete_serializes_against_new_message_and_fences_expired_run():
    from runs import FencedDB, RunExpired
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            aid = await attach(pool, tenant, user, cid)
            repo = ConversationRepository(pool, tenant, user)
            run, lease, _ = await repo.begin_run(cid, '', attachment_ids=[aid])
            await pool.execute("UPDATE chat_response_runs SET lease_until=now()-interval '1 second' WHERE id=$1", run)
            entered, release = asyncio.Event(), asyncio.Event()
            async def clean():
                entered.set()
                await release.wait()
            delete = asyncio.create_task(repo.delete(cid, clean))
            await asyncio.wait_for(entered.wait(), 2)
            bind = asyncio.create_task(repo.begin_run(cid, 'Tentativa concorrente'))
            await asyncio.sleep(0.05)
            assert not bind.done()
            release.set()
            await delete
            with pytest.raises(ConversationError) as gone:
                await bind
            assert gone.value.status_code == 404
            with pytest.raises(RunExpired):
                await FencedDB(pool, run, lease).complete(cid, 'worker antigo')
            assert await pool.fetchval('SELECT count(*) FROM chat_messages') == 0
    asyncio.run(scenario())
