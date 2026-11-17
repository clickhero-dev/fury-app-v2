"""Funcionalidade: isolamento de conversas no PostgreSQL
Cenário: usuário de outro tenant não consulta conversa
Dado duas identidades delegadas de tenants distintos
Quando uma delas consulta a conversa da outra
Então recebe 404 e não vê as mensagens
"""
import time
import asyncio
import os
import uuid
import pytest
import asyncpg
import jwt
import json
import httpx
from fastapi.testclient import TestClient
from app import create_app

URL = os.getenv('CHAT_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='CHAT_TEST_DATABASE_URL ausente')

def test_cross_tenant_conversation_denied(monkeypatch):
    async def seed():
        conn = await asyncpg.connect(URL)
        tenants, users = [], []
        try:
            for _ in range(2):
                suffix = str(uuid.uuid4())
                tenant = await conn.fetchval('INSERT INTO tenants(name,slug) VALUES($1,$2) RETURNING id', 'Chat teste', suffix)
                user = await conn.fetchval('INSERT INTO users(tenant_id,email) VALUES($1,$2) RETURNING id', tenant, suffix + '@example.invalid')
                tenants.append(tenant); users.append(user)
            return tenants, users
        finally: await conn.close()
    async def cleanup(tenants):
        conn = await asyncpg.connect(URL)
        try: await conn.execute('DELETE FROM tenants WHERE id=ANY($1::uuid[])', tenants)
        finally: await conn.close()
    tenants, users = asyncio.run(seed())
    monkeypatch.setenv('DATABASE_URL', URL)
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', 'test-secret-with-at-least-32-characters')
    def token(index):
        return jwt.encode({'actor':'chatbot','userId':str(users[index]),'tenantId':str(tenants[index]),'iat':int(time.time()),'exp':int(time.time())+300,'email':'test@example.invalid','role':'admin','iss':'ady-api','aud':'ady-chat'}, os.environ['CHAT_DELEGATION_SECRET'], algorithm='HS256')
    try:
        with TestClient(create_app()) as client:
            first = {'Authorization':'Bearer '+token(0)}
            second = {'Authorization':'Bearer '+token(1)}
            created = client.post('/conversations', headers=first)
            assert created.status_code == 201
            cid = created.json()['id']
            assert client.get('/conversations/'+cid, headers=first).status_code == 200
            assert client.get('/conversations/'+cid, headers=second).status_code == 404
            async def stale_action():
                conn = await asyncpg.connect(URL)
                try:
                    return await conn.fetchval("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,status,expires_at,execution_started_at) VALUES($1,$2,$3,'POST','/api/campaigns/create','{}','executing',now()+interval '1 hour',now()-interval '6 minutes') RETURNING id", tenants[0], users[0], uuid.UUID(cid))
                finally: await conn.close()
            stale_action_id = str(asyncio.run(stale_action()))
            state = client.get('/conversations/'+cid, headers=first).json()
            assert next(a for a in state['approvals'] if a['id'] == stale_action_id)['status'] == 'unknown'
            assert isinstance(next(a for a in state['approvals'] if a['id'] == stale_action_id).get('created_at'), str)
            import agno.agent
            from types import SimpleNamespace
            class FakeAgent:
                def __init__(self, **kwargs):
                    assert any('Não afirme moeda' in instruction for instruction in kwargs['instructions'])
                def arun(self, *args, **kwargs):
                    async def tokens():
                        yield SimpleNamespace(content='Olá ')
                        yield SimpleNamespace(content='mundo')
                    return tokens()
            monkeypatch.setattr(agno.agent, 'Agent', FakeAgent)
            stream_response = client.post('/conversations/'+cid+'/messages', headers=first, json={'content':'Olá'})
            assert stream_response.status_code == 200
            assert 'event: token' in stream_response.text
            assert 'event: done' in stream_response.text
            assert any(m['content'] == 'Olá mundo' for m in client.get('/conversations/'+cid, headers=first).json()['messages'])
            import openai
            monkeypatch.setenv('POSTHOG_API_KEY', '')
            failed_response = httpx.Response(401, request=httpx.Request('POST', 'https://provider.invalid'))
            failures = [httpx.ReadTimeout('private timeout'), openai.AuthenticationError('private token', response=failed_response, body=None), RuntimeError('private error')]
            for failure in failures:
                class FailingAgent:
                    def __init__(self, **kwargs): pass
                    def arun(self, *args, **kwargs):
                        async def tokens():
                            raise failure
                            yield None
                        return tokens()
                monkeypatch.setattr(agno.agent, 'Agent', FailingAgent)
                failed = client.post('/conversations/'+cid+'/messages', headers=first, json={'content':'Pergunta'})
                assert 'event: error' in failed.text
                assert 'private' not in failed.text
            async def crashed_run():
                conn = await asyncpg.connect(URL)
                try:
                    last = await conn.fetchval("SELECT id FROM chat_messages WHERE conversation_id=$1 AND role='user' ORDER BY created_at DESC LIMIT 1", uuid.UUID(cid))
                    old_lease = uuid.uuid4()
                    old_run = await conn.fetchval("INSERT INTO chat_response_runs(conversation_id,user_message_id,lease_id,status,lease_until) VALUES($1,$2,$3,'running',now()-interval '1 second') RETURNING id", uuid.UUID(cid), last, old_lease)
                    approval = await conn.fetchval("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,expires_at) VALUES($1,$2,$3,'POST','/api/studio/ai/generate-image','{}',now()+interval '1 hour') RETURNING id", tenants[0],users[0],uuid.UUID(cid))
                    return old_run, old_lease, approval
                finally: await conn.close()
            old_run, old_lease, old_approval_id = asyncio.run(crashed_run())
            old_approval = str(old_approval_id)
            before = client.get('/conversations/'+cid, headers=first).json()
            assert before['response_run']['status'] == 'interrupted'
            class RetryAgent(FakeAgent):
                def __init__(self, **kwargs):
                    assert all(not t.__name__.startswith('propose_') for t in kwargs['tools'])
            monkeypatch.setattr(agno.agent, 'Agent', RetryAgent)
            retry_response = client.post('/conversations/'+cid+'/retry', headers=first)
            assert 'event: done' in retry_response.text
            after = client.get('/conversations/'+cid, headers=first).json()
            assert len([m for m in after['messages'] if m['role']=='user']) == len([m for m in before['messages'] if m['role']=='user'])
            assert any(a['id']==old_approval and a['status']=='pending' for a in after['approvals'])
            assert after['response_run']['status'] == 'completed'
            async def reject_stale_worker():
                from runs import FencedDB, RunExpired
                pool = await asyncpg.create_pool(URL)
                try:
                    with pytest.raises(RunExpired):
                        await FencedDB(pool, old_run, old_lease).fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,expires_at) VALUES($1,$2,$3,'POST','/api/studio/ai/generate-image','{}',now()+interval '1 hour') RETURNING id",tenants[0],users[0],uuid.UUID(cid))
                finally: await pool.close()
            asyncio.run(reject_stale_worker())
            import threading
            import concurrent.futures
            started = threading.Event()
            class SlowAgent:
                def __init__(self, **kwargs): pass
                def arun(self, *args, **kwargs):
                    async def tokens():
                        started.set()
                        await asyncio.sleep(0.4)
                        yield SimpleNamespace(content='Terminado')
                    return tokens()
            monkeypatch.setattr(agno.agent, 'Agent', SlowAgent)
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                first_run = executor.submit(client.post, '/conversations/'+cid+'/messages', headers=first, json={'content':'Primeira'})
                assert started.wait(5)
                concurrent_response = client.post('/conversations/'+cid+'/messages', headers=first, json={'content':'Segunda'})
                assert concurrent_response.status_code == 200
                assert 'event: done' in concurrent_response.text
                assert 'event: done' in first_run.result().text
            async def proposal():
                conn = await asyncpg.connect(URL)
                try:
                    return await conn.fetchval("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,expires_at) VALUES($1,$2,$3,'POST','/api/studio/ai/generate-image',$4::jsonb,now()+interval '1 hour') RETURNING id", tenants[0], users[0], uuid.UUID(cid), json.dumps({'model':'google/gemini-3.1-flash-image','prompt':'imagem de um belo café'}))
                finally: await conn.close()
            approval_id = str(asyncio.run(proposal()))
            calls = []
            def handler(request):
                calls.append(request)
                assert request.headers['x-chat-approval-id'] == approval_id
                return httpx.Response(200, json={'url':'https://example.invalid/image.png'})
            client.app.state.http._transport = httpx.MockTransport(handler)
            assert client.post('/approvals/'+approval_id+'/confirm', headers=second).status_code == 404
            assert client.post('/approvals/'+approval_id+'/confirm', headers=first).status_code == 200
            assert client.post('/approvals/'+approval_id+'/confirm', headers=first).status_code == 404
            async def stale_proposal():
                conn = await asyncpg.connect(URL)
                try:
                    return await conn.fetchval("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'PATCH',$4,$5::jsonb,$6::jsonb,now()+interval '1 hour') RETURNING id", tenants[0], users[0], uuid.UUID(cid), '/api/planner/posts/'+str(uuid.uuid4())+'/chat-cancel', '{"version":"12"}', '{"caption":"Café"}')
                finally: await conn.close()
            stale_id = str(asyncio.run(stale_proposal()))
            client.app.state.http._transport = httpx.MockTransport(lambda req: httpx.Response(409, json={'error':'changed'}))
            stale_response = client.post('/approvals/'+stale_id+'/confirm', headers=first)
            assert stale_response.status_code == 409
            assert 'nova proposta' in stale_response.json()['detail']
            assert len(calls) == 1
            detail = client.get('/conversations/'+cid, headers=first).json()
            assert next(a for a in detail['approvals'] if a['id'] == approval_id)['result']['url'] == 'https://example.invalid/image.png'
            async def budget_proposals():
                conn = await asyncpg.connect(URL)
                try:
                    old = await conn.fetchval("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,expires_at) VALUES($1,$2,$3,'POST','/api/campaigns/create',$4::jsonb,now()+interval '1 hour') RETURNING id", tenants[0],users[0],uuid.UUID(cid),json.dumps({'dailyBudget':500}))
                    valid = await conn.fetchval("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'POST','/api/campaigns/create',$4::jsonb,$5::jsonb,now()+interval '1 hour') RETURNING id", tenants[0],users[0],uuid.UUID(cid),json.dumps({'dailyBudget':500}),json.dumps({'dailyBudget':500,'currency':'BRL'}))
                    return str(old),str(valid)
                finally: await conn.close()
            old_budget, valid_budget = asyncio.run(budget_proposals())
            state = client.get('/conversations/'+cid, headers=first).json()
            assert next(a for a in state['approvals'] if a['id']==old_budget)['status'] == 'expired'
            assert client.post('/approvals/'+old_budget+'/confirm',headers=first).status_code == 404
            def budget_handler(request):
                assert request.url.path == '/api/campaigns/create'
                assert json.loads(request.content)['dailyBudget'] == 500
                return httpx.Response(201,json={'success':True})
            client.app.state.http._transport = httpx.MockTransport(budget_handler)
            assert client.post('/approvals/'+valid_budget+'/confirm',headers=first).status_code == 200
            job_id = str(uuid.uuid4())
            async def saved_job():
                conn = await asyncpg.connect(URL)
                try:
                    return await conn.fetchval("INSERT INTO chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) VALUES($1,$2,$3,$4,'POST',$5,'{}'::jsonb,'executing',now()+interval '1 hour') RETURNING id", uuid.UUID(job_id), tenants[0], users[0], uuid.UUID(cid), '/api/studio/video/assets/'+str(uuid.uuid4())+'/chat-adjust')
                finally: await conn.close()
            job_approval = str(asyncio.run(saved_job()))
            states = iter(['running','done'])
            def job_handler(request):
                assert request.url.path == '/api/studio/video/jobs/'+job_id
                return httpx.Response(200, json={'jobId':job_id,'status':next(states),'stage':'rendering','videoUrl':'https://example.invalid/v.mp4'})
            client.app.state.http._transport = httpx.MockTransport(job_handler)
            def job_state():
                data = client.get('/conversations/'+cid, headers=first).json()
                return next(a for a in data['approvals'] if a['id'] == job_approval)['result']['job']['status']
            assert job_state() == 'running'
            assert job_state() == 'done'
            assert job_state() == 'done'  # resultado terminal persistido, sem nova consulta
            recover_id = str(uuid.uuid4())
            async def approved_job():
                conn = await asyncpg.connect(URL)
                try:
                    await conn.execute("INSERT INTO chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,status,expires_at) VALUES($1,$2,$3,$4,'POST','/api/studio/video/jobs',$5::jsonb,'approved',now()+interval '1 hour')", uuid.UUID(recover_id), tenants[0], users[0], uuid.UUID(cid), '{"prompt":"cafe"}')
                finally: await conn.close()
            asyncio.run(approved_job())
            recovery_calls = []
            def recovery_handler(request):
                if request.method == 'POST':
                    recovery_calls.append(request)
                    assert request.headers['x-chat-approval-id'] == recover_id
                    return httpx.Response(202, json={'jobId':recover_id})
                return httpx.Response(404)
            client.app.state.http._transport = httpx.MockTransport(recovery_handler)
            client.get('/conversations/'+cid, headers=first)
            for _ in range(40):
                if recovery_calls: break
                time.sleep(0.025)
            assert len(recovery_calls) == 1
            async def expire():
                conn = await asyncpg.connect(URL)
                try: await conn.execute("UPDATE chat_approvals SET status='pending', expires_at=now()-interval '1 minute' WHERE id=$1", uuid.UUID(approval_id))
                finally: await conn.close()
            asyncio.run(expire())
            assert next(a for a in client.get('/conversations/'+cid, headers=first).json()['approvals'] if a['id'] == approval_id)['status'] == 'expired'
            assert client.post('/approvals/'+approval_id+'/confirm', headers=first).status_code == 404
    finally: asyncio.run(cleanup(tenants))
