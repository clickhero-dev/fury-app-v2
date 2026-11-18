"""Real Node process -> JIT JWT -> HTTP socket/FastAPI -> PostgreSQL.

Only the model, title/compaction and RBAC port are synthetic. Delegation
verification, currentIdentity SQL, causal checkpoints and run fences are real.
"""
import asyncio
import json
import os
import socket
from pathlib import Path
from types import SimpleNamespace

import agno.agent
import app as chat
import pytest
import uvicorn
from assistant_policy import POLICY_VERSION
from checkpoints import CheckpointRepository
from conversation_repository import ConversationRepository
from test_attachments_postgres import URL, database

pytestmark=pytest.mark.skipif(not URL,reason='CHAT_MEDIA_TEST_DATABASE_URL isolado ausente')
ROOT=Path(__file__).resolve().parents[3]
SECRET='synthetic-cross-service-jit-delegation-secret-only'


def test_real_worker_restart_recovers_snapshot_over_http_exactly_once(monkeypatch):
    async def scenario():
        async with database() as (pool,tenant,user,cid):
            schema=await pool.fetchval('SELECT current_schema()')
            await pool.execute('''ALTER TABLE tenants ADD COLUMN deleted_at timestamptz;
                ALTER TABLE users ADD COLUMN tenant_id uuid,ADD COLUMN email text,
                ADD COLUMN role text,ADD COLUMN deleted_at timestamptz''')
            await pool.execute("UPDATE users SET tenant_id=$1,email='fixture@example.invalid',role='admin' WHERE id=$2",tenant,user)
            run,lease,mid=await ConversationRepository(pool,tenant,user).begin_run(cid,'Original persisted user message')
            checkpoint=CheckpointRepository(pool,tenant,user,cid,run,lease,mid,policy_version=POLICY_VERSION)
            await checkpoint.save_context([{'frozen':'original-context-canary'}],
                                          [{'role':'user','content':'original-snapshot-canary'}])
            # Dead producer has no live Python/Node task. Mutable message contents
            # intentionally disagree, proving the restarted runtime uses snapshot.
            await pool.execute("UPDATE chat_messages SET content='changed-after-crash' WHERE id=$1",mid)
            await pool.execute("UPDATE chat_response_runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",run)
            calls=[]
            class FakeAgent:
                def __init__(self,**options):
                    assert 'original-context-canary' in ' '.join(options['instructions'])
                    names=[getattr(tool,'__name__',None) or getattr(tool,'name','') for tool in options['tools']]
                    assert 'create_plan' not in names
                    assert not any(name.startswith('propose_') for name in names)
                def arun(self,history,**kwargs):
                    assert [m.content for m in history]==['original-snapshot-canary']
                    calls.append(1)
                    async def stream():
                        yield SimpleNamespace(content='Snapshot retomado exatamente uma vez.')
                    return stream()
            async def noop(*args,**kwargs): return None
            monkeypatch.setattr(agno.agent,'Agent',FakeAgent)
            monkeypatch.setattr(chat,'generate_title',noop)
            monkeypatch.setattr(chat,'consolidate',noop)
            monkeypatch.setenv('MODEL_CHATBOT','synthetic/no-network')
            monkeypatch.setenv('ADY_API_URL','http://127.0.0.1:9')
            monkeypatch.setenv('CHAT_DELEGATION_SECRET',SECRET)
            monkeypatch.setenv('POSTHOG_API_KEY','')
            application=chat.create_app() # No auth override: real JIT delegation verifier.
            listener=socket.socket()
            listener.bind(('127.0.0.1',0))
            listener.listen(32)
            port=listener.getsockname()[1]
            server=uvicorn.Server(uvicorn.Config(application,lifespan='off',access_log=False,log_level='critical'))
            async with application.router.lifespan_context(application):
                application.state.pool=pool
                serving=asyncio.create_task(server.serve(sockets=[listener]))
                try:
                    async def ready():
                        while not server.started:
                            if serving.done(): await serving
                            await asyncio.sleep(.01)
                    await asyncio.wait_for(ready(),5)
                    async def node_tick():
                        # Deliberately do not inherit provider keys or dotenv config.
                        env={'PATH':os.environ.get('PATH',''),'NODE_ENV':'test',
                             'DOTENV_CONFIG_PATH':'/dev/null','DOTENV_CONFIG_QUIET':'true',
                             'JWT_SECRET':'synthetic-jwt-secret-at-least-32-characters',
                             'JWT_REFRESH_SECRET':'synthetic-refresh-secret-at-least-32-characters',
                             'TOKEN_ENCRYPTION_KEY':'1'*64,'CHAT_DELEGATION_SECRET':SECRET,
                             'DATABASE_URL':URL,'TEST_DATABASE_URL':URL,
                             'CHAT_MEDIA_TEST_DATABASE_URL':URL,'CHAT_CROSS_SERVICE_SCHEMA':schema,
                             'CHAT_SERVICE_URL':f'http://127.0.0.1:{port}'}
                        proc=await asyncio.create_subprocess_exec(
                            str(ROOT/'node_modules/.bin/tsx'),
                            str(ROOT/'apps/api/src/__tests__/chat-turn-cross-service.harness.ts'),
                            cwd=ROOT,env=env,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
                        try: stdout,stderr=await asyncio.wait_for(proc.communicate(),30)
                        except BaseException:
                            proc.kill()
                            await proc.wait()
                            raise
                        # Never include subprocess diagnostics (URLs/JWTs) in errors.
                        assert proc.returncode==0,'Node cross-service fixture failed'
                        assert not stderr,'Node fixture unexpectedly wrote diagnostics'
                        payload=json.loads(stdout)
                        assert set(payload)=={'candidates','authorized','completed','attempts','responses'}
                        return payload
                    assert await node_tick()=={'candidates':1,'authorized':1,'completed':1,'attempts':1,'responses':1}
                    # A fresh OS process/new runtime reconciles again; no replay.
                    assert await node_tick()=={'candidates':0,'authorized':0,'completed':1,'attempts':1,'responses':1}
                    assert len(calls)==1
                    rows=await pool.fetch('SELECT content FROM chat_messages WHERE role=$1 AND conversation_id=$2','assistant',cid)
                    assert [r['content'] for r in rows]==['Snapshot retomado exatamente uma vez.']
                    assert await pool.fetchval('SELECT count(*) FROM chat_response_runs WHERE user_message_id=$1',mid)==2
                    assert await pool.fetchval("SELECT status FROM chat_turn_recovery WHERE user_message_id=$1",mid)=='completed'
                finally:
                    server.should_exit=True
                    await asyncio.wait_for(serving,10)
                    application.state.pool=None
                    listener.close()
    asyncio.run(scenario())
