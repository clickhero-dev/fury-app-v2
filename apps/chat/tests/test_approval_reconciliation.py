"""Funcionalidade: reconciliar execução interrompida
Cenário: ação síncrona antiga vira resultado desconhecido
Dado uma execução síncrona iniciada há mais de cinco minutos
Quando a conversa é consultada
Então a ação é marcada como resultado desconhecido sem ser executada novamente
Cenário: jobs e execuções recentes não são alterados
Dado jobs de vídeo e uma ação síncrona recente
Quando a conversa é consultada
Então suas execuções continuam em andamento
"""
import asyncio
import os
import uuid
import pytest
import asyncpg
from approvals import reconcile_stale_approvals

URL = os.getenv('CHAT_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='CHAT_TEST_DATABASE_URL ausente')

def test_reconciles_only_stale_synchronous_for_owner():
    async def run():
        conn = await asyncpg.connect(URL)
        try:
            await conn.execute('CREATE TEMP TABLE chat_approvals(id uuid,conversation_id uuid,tenant_id uuid,user_id uuid,path text,status text,execution_started_at timestamptz,result jsonb)')
            conversation, tenant, user, other = [uuid.uuid4() for _ in range(4)]
            rows = [
                (uuid.uuid4(),conversation,tenant,user,'/api/studio/ai/generate-image','executing',True),
                (uuid.uuid4(),conversation,tenant,user,'/api/studio/video/jobs','executing',True),
                (uuid.uuid4(),conversation,tenant,user,'/api/studio/video/assets/'+str(uuid.uuid4())+'/chat-adjust','executing',True),
                (uuid.uuid4(),conversation,tenant,user,'/api/campaigns/create','executing',False),
                (uuid.uuid4(),conversation,tenant,other,'/api/campaigns/create','executing',True),
            ]
            for identifier, cid, tid, uid, path, status, old in rows:
                await conn.execute("INSERT INTO chat_approvals VALUES($1,$2,$3,$4,$5,$6,now()-$7 * interval '1 minute',NULL)",identifier,cid,tid,uid,path,status,6 if old else 1)
            await reconcile_stale_approvals(conn, conversation, tenant, user)
            output = await conn.fetch('SELECT id,status,result FROM chat_approvals')
            by_id = {r['id']:r for r in output}
            assert by_id[rows[0][0]]['status'] == 'unknown'
            assert 'Verifique' in by_id[rows[0][0]]['result']
            assert all(by_id[row[0]]['status'] == 'executing' for row in rows[1:])
        finally: await conn.close()
    asyncio.run(run())

# Cenário: falha de rede antes de consumo deixa ação síncrona indeterminada
# Dado aprovação ainda não consumida e job de vídeo aprovado
# Quando ocorre falha de rede
# Então somente ação síncrona vira resultado desconhecido

def test_network_failure_keeps_jobs_recoverable():
    from approvals import mark_unconfirmed_sync_unknown
    async def run():
        conn = await asyncpg.connect(URL)
        try:
            await conn.execute('CREATE TEMP TABLE chat_approvals(id uuid,tenant_id uuid,user_id uuid,path text,status text,result jsonb)')
            tenant, user, action_id, job_id = [uuid.uuid4() for _ in range(4)]
            await conn.execute("INSERT INTO chat_approvals VALUES($1,$2,$3,'/api/campaigns/create','approved',NULL),($4,$2,$3,'/api/studio/video/jobs','approved',NULL)", action_id, tenant, user, job_id)
            await mark_unconfirmed_sync_unknown(conn, action_id, tenant, user)
            await mark_unconfirmed_sync_unknown(conn, job_id, tenant, user)
            assert await conn.fetchval('SELECT status FROM chat_approvals WHERE id=$1', action_id) == 'unknown'
            assert await conn.fetchval('SELECT status FROM chat_approvals WHERE id=$1', job_id) == 'approved'
        finally: await conn.close()
    asyncio.run(run())

# Cenário: aprovação de vídeo vence antes do envio
# Dado uma aprovação ainda não consumida com prazo expirado
# Quando a conversa é consultada
# Então ela aparece expirada e não pode ser redespachada

def test_expired_approved_is_not_recoverable():
    from datetime import datetime, timedelta, timezone
    from approvals import effective_status
    from streaming import recoverable_job_id
    expired = datetime.now(timezone.utc) - timedelta(seconds=1)
    status = effective_status('approved', expired)
    assert status == 'expired'
    assert recoverable_job_id('/api/studio/video/jobs', status, str(uuid.uuid4()), None) is None
    assert effective_status('executing', expired) == 'executing'

# Cenário: job de vídeo não existe após falha prolongada
# Dado execução de vídeo antiga sem workflow persistido
# Quando consulta a conversa
# Então status fica indeterminado sem reenviar a ação
# Cenário: job existente ou recente não é classificado como perdido
# Dado execução com workflow salvo ou iniciada recentemente
# Quando consulta a conversa
# Então permanece em execução

def test_stale_video_job_missing_is_unknown():
    from approvals import reconcile_stale_video_jobs
    async def run():
        conn = await asyncpg.connect(URL)
        try:
            await conn.execute('CREATE TEMP TABLE chat_approvals(id uuid,conversation_id uuid,tenant_id uuid,user_id uuid,path text,status text,execution_started_at timestamptz,result jsonb)')
            await conn.execute('CREATE TEMP TABLE workflow_jobs(id uuid,tenant_id uuid,workflow text)')
            cid, tid, uid, missing, present, recent, other = [uuid.uuid4() for _ in range(7)]
            for identity, owner, minutes in [(missing,uid,6),(present,uid,6),(recent,uid,1),(other,uuid.uuid4(),6)]:
                await conn.execute("INSERT INTO chat_approvals VALUES($1,$2,$3,$4,'/api/studio/video/jobs','executing',now()-$5 * interval '1 minute',NULL)",identity,cid,tid,owner,minutes)
            await conn.execute("INSERT INTO workflow_jobs VALUES($1,$2,'studio-video')",present,tid)
            class Acquire:
                async def __aenter__(self): return conn
                async def __aexit__(self,*args): return False
            class Pool:
                def acquire(self): return Acquire()
            await reconcile_stale_video_jobs(Pool(),cid,tid,uid)
            statuses = {r['id']:r['status'] for r in await conn.fetch('SELECT id,status FROM chat_approvals')}
            assert statuses[missing] == 'unknown'
            assert all(statuses[x] == 'executing' for x in (present,recent,other))
        finally: await conn.close()
    asyncio.run(run())

# Cenário: job é salvo enquanto reconciliação aguarda lock
# Dado criador segurando a aprovação e inserindo job
# Quando a reconciliação inicia antes do commit
# Então após o commit ela vê o job e preserva a execução

def test_video_reconciliation_sees_job_committed_while_waiting():
    from approvals import reconcile_stale_video_jobs
    async def run():
        schema = 'chat_reconcile_' + uuid.uuid4().hex
        admin = await asyncpg.connect(URL)
        pool = None
        try:
            await admin.execute('CREATE SCHEMA '+schema)
            await admin.execute('CREATE TABLE '+schema+'.chat_approvals(id uuid,conversation_id uuid,tenant_id uuid,user_id uuid,path text,status text,execution_started_at timestamptz,result jsonb)')
            await admin.execute('CREATE TABLE '+schema+'.workflow_jobs(id uuid,tenant_id uuid,workflow text)')
            cid, tid, uid, job = [uuid.uuid4() for _ in range(4)]
            await admin.execute("INSERT INTO "+schema+".chat_approvals VALUES($1,$2,$3,$4,'/api/studio/video/jobs','executing',now()-interval '6 minutes',NULL)",job,cid,tid,uid)
            pool = await asyncpg.create_pool(URL,min_size=2,max_size=3,server_settings={'search_path':schema})
            async with pool.acquire() as creator:
                async with creator.transaction():
                    await creator.fetchval('SELECT id FROM chat_approvals WHERE id=$1 FOR UPDATE',job)
                    await creator.execute("INSERT INTO workflow_jobs VALUES($1,$2,'studio-video')",job,tid)
                    reconciler = asyncio.create_task(reconcile_stale_video_jobs(pool,cid,tid,uid))
                    await asyncio.sleep(0.05)
                    assert not reconciler.done()
                await asyncio.wait_for(reconciler,2)
            assert await admin.fetchval('SELECT status FROM '+schema+'.chat_approvals WHERE id=$1',job) == 'executing'
        finally:
            if pool: await pool.close()
            await admin.execute('DROP SCHEMA '+schema+' CASCADE')
            await admin.close()
    asyncio.run(run())
