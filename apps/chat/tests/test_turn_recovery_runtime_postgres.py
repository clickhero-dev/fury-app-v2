"""Real PG restart/retry/fencing contracts, no paid providers."""
import asyncio
from uuid import uuid4
import httpx
import pytest
from conversation_repository import ConversationRepository
from turn_recovery import TurnRecovery
from attachment_repository import ConversationError
from runs import FencedDB, RunExpired
from test_attachments_postgres import database, URL

pytestmark = pytest.mark.skipif(not URL, reason='isolated PostgreSQL required')


def test_restart_and_duplicate_claims_keep_global_limits_and_fence_old_worker():
    async def scenario():
        async with database() as (pool,tenant,user,cid):
            repo = ConversationRepository(pool,tenant,user)
            run,lease,mid = await repo.begin_run(cid,'Original')
            await TurnRecovery(pool,tenant,user).finish(run,lease,transient=True)
            with pytest.raises(ConversationError):
                await repo.begin_run(cid,retry=True,retry_run_id=run,automatic=True)
            await pool.execute('UPDATE chat_turn_recovery SET next_attempt_at=clock_timestamp()')
            # Simulate restarted process with no runtime state.
            restarted = ConversationRepository(pool,tenant,user)
            results = await asyncio.gather(*[
                restarted.begin_run(cid,retry=True,retry_run_id=run,automatic=True)
                for _ in range(2)
            ],return_exceptions=True)
            valid = [r for r in results if isinstance(r,tuple)]
            assert len(valid) == 1
            assert len([r for r in results if isinstance(r,ConversationError)]) == 1
            next_run,next_lease,reused = valid[0]
            assert reused == mid
            with pytest.raises(RunExpired):
                await FencedDB(pool,run,lease).complete(cid,'stale')
            await TurnRecovery(pool,tenant,user).finish(next_run,next_lease,transient=True)
            await pool.execute('UPDATE chat_turn_recovery SET next_attempt_at=clock_timestamp()')
            final,final_lease,_ = await restarted.begin_run(cid,retry=True,retry_run_id=next_run,automatic=True)
            await TurnRecovery(pool,tenant,user).finish(final,final_lease,transient=True)
            assert await pool.fetchval('SELECT attempts FROM chat_turn_recovery WHERE user_message_id=$1',mid) == 2
            assert await pool.fetchval('SELECT status FROM chat_turn_recovery WHERE user_message_id=$1',mid) == 'exhausted'
            for automatic in (True,False):
                with pytest.raises(ConversationError):
                    await restarted.begin_run(cid,retry=True,retry_run_id=final,automatic=automatic)
    asyncio.run(scenario())


def test_change_direction_cancels_current_and_future_work():
    async def scenario():
        async with database() as (pool,tenant,user,cid):
            repo = ConversationRepository(pool,tenant,user)
            run,lease,mid = await repo.begin_run(cid,'Primeiro')
            await TurnRecovery(pool,tenant,user).finish(run,lease,transient=True)
            await pool.execute('UPDATE chat_turn_recovery SET next_attempt_at=clock_timestamp()')
            run,lease,_ = await repo.begin_run(cid,retry=True,retry_run_id=run,automatic=True)
            newer,_,_ = await repo.begin_run(cid,'Mude de direção')
            assert newer != run
            assert await pool.fetchval('SELECT status FROM chat_turn_recovery WHERE user_message_id=$1',mid) == 'stopped'
            with pytest.raises(RunExpired):
                await FencedDB(pool,run,lease).complete(cid,'Não deve ser salva')
            with pytest.raises(ConversationError):
                await repo.begin_run(cid,retry=True,retry_run_id=run,automatic=True)
            await TurnRecovery(pool,tenant,user).finish(run,lease,transient=True)
            assert await pool.fetchval('SELECT status FROM chat_turn_recovery WHERE user_message_id=$1',mid) == 'stopped'
    asyncio.run(scenario())


def test_automatic_claim_rechecks_direction_even_if_stale_writer_queued_it():
    async def scenario():
        async with database() as (pool,tenant,user,cid):
            repo=ConversationRepository(pool,tenant,user)
            run,lease,mid=await repo.begin_run(cid,'Original')
            await TurnRecovery(pool,tenant,user).finish(run,lease,transient=True)
            await repo.begin_run(cid,'Direção humana mais recente')
            await pool.execute("""UPDATE chat_turn_recovery SET status='queued',
                next_attempt_at=clock_timestamp() WHERE user_message_id=$1""",mid)
            with pytest.raises(ConversationError):
                await repo.begin_run(cid,retry=True,retry_run_id=run,automatic=True)
            assert await pool.fetchval('SELECT attempts FROM chat_turn_recovery WHERE user_message_id=$1',mid)==0
    asyncio.run(scenario())


def test_cancel_reports_completion_winning_the_conversation_lock():
    async def scenario():
        async with database() as (pool,tenant,user,cid):
            run,lease,mid=await ConversationRepository(pool,tenant,user).begin_run(cid,'Original')
            cancelling=None
            async with pool.acquire() as conn:
                async with conn.transaction():
                    owner_pid=await conn.fetchval('SELECT pg_backend_pid()')
                    await conn.fetchval('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE',cid)
                    # Commit gap: completed message/run committed, recovery metadata
                    # still running. Cancellation has to observe the completed run.
                    await conn.execute("UPDATE chat_response_runs SET status='completed' WHERE id=$1",run)
                    cancelling=asyncio.create_task(TurnRecovery(pool,tenant,user).cancel(cid,run))
                    for _ in range(100):
                        waiting=await pool.fetchval("""SELECT count(*) FROM pg_stat_activity
                            WHERE wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0
                            AND query LIKE '%SELECT id FROM chat_conversations%'
                            AND $1=ANY(pg_blocking_pids(pid))
                            AND pid<>pg_backend_pid()""",owner_pid)
                        if waiting: break
                        await asyncio.sleep(.01)
                    assert waiting
            assert await cancelling=={'status':'completed'}
            assert await pool.fetchval('SELECT status FROM chat_turn_recovery WHERE user_message_id=$1',mid)=='completed'
            assert await pool.fetchval('SELECT status FROM chat_response_runs WHERE id=$1',run)=='completed'
    asyncio.run(scenario())


def test_cancel_endpoint_auth_ownership_validation_and_fencing():
    async def scenario():
        import app as chat
        async with database() as (pool,tenant,user,cid):
            run,lease,_ = await ConversationRepository(pool,tenant,user).begin_run(cid,'Cancelar')
            app = chat.create_app()
            async with app.router.lifespan_context(app):
                app.state.pool = pool
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://chat') as client:
                    path = f'/conversations/{cid}/runs/{run}/cancel'
                    assert (await client.post(path)).status_code == 401
                    app.dependency_overrides[chat.identity] = lambda: {'tenantId':uuid4(),'userId':user}
                    assert (await client.post(path)).status_code == 403
                    app.dependency_overrides[chat.identity] = lambda: {'tenantId':uuid4(),'userId':user,'humanIntent':True}
                    assert (await client.post(path)).status_code == 404
                    app.dependency_overrides[chat.identity] = lambda: {'tenantId':tenant,'userId':user,'humanIntent':True}
                    assert (await client.post(f'/conversations/{cid}/runs/not-uuid/cancel')).status_code == 400
                    assert (await client.post(f'/conversations/{cid}/runs/{uuid4()}/cancel')).status_code == 404
                    assert (await client.post(path)).json() == {'status':'cancelled'}
                    assert (await client.post(path)).status_code == 200
                    with pytest.raises(RunExpired):
                        await FencedDB(pool,run,lease).complete(cid,'late')
                app.state.pool = None
    asyncio.run(scenario())
