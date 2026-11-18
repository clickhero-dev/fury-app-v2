"""Funcionalidade: confirmar recusa com HTTP real e PostgreSQL isolado
Cenário: recusa sobrevive ao request e ao finish atrasado do Node
Dado uma aprovação nova em schema exclusivo e uma API simulada
Quando confirma e lê novamente o registro, então a causa segura permanece
Cenário: dois cliques concorrentes não duplicam a execução
Dado a mesma aprovação pendente, quando confirma duas vezes, então há um POST
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import httpx
import pytest
from fastapi.testclient import TestClient

from app import create_app
from approval_repository import LEGACY_FAILURE
from test_confirmation_outcomes import SECRET, headers

URL = os.getenv('CHAT_OUTCOME_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='CHAT_OUTCOME_TEST_DATABASE_URL isolada ausente')


@pytest.mark.parametrize('node_fail_first', [False, True])
def test_confirmation_persists_actor_scoped_cause_and_suppresses_replay(monkeypatch, node_fail_first):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    schema = 'chat_confirm_' + uuid4().hex
    approval, tenant, user, conversation = uuid4(), uuid4(), uuid4(), uuid4()
    app, calls = create_app(), []

    async def setup():
        conn = await asyncpg.connect(URL)
        try:
            await conn.execute('CREATE SCHEMA ' + schema)
            await conn.execute('SET search_path TO ' + schema)
            await conn.execute('CREATE TABLE chat_conversations(id uuid PRIMARY KEY,tenant_id uuid,user_id uuid)')
            await conn.execute('INSERT INTO chat_conversations VALUES($1,$2,$3)', conversation, tenant, user)
            await conn.execute('''CREATE TABLE chat_approvals(
                id uuid PRIMARY KEY,tenant_id uuid,user_id uuid,method text,path text,
                body jsonb,display jsonb,status text,expires_at timestamptz,result jsonb,
                conversation_id uuid REFERENCES chat_conversations(id))''')
            await conn.execute("INSERT INTO chat_approvals VALUES($1,$2,$3,'POST','/api/studio/video/jobs','{}',NULL,'pending',now()+interval '1 hour',NULL,$4)", approval, tenant, user, conversation)
            await conn.execute((Path(__file__).parents[3] / 'packages/db/migrations/0082_chat_batch_approvals.sql').read_text())
        finally:
            await conn.close()
        return await asyncpg.create_pool(URL, min_size=1, max_size=3, server_settings={'search_path': schema})

    async def cleanup():
        conn = await asyncpg.connect(URL)
        try:
            await conn.execute('DROP SCHEMA ' + schema + ' CASCADE')
        finally:
            await conn.close()

    async def node_fail():
        await app.state.pool.execute("UPDATE chat_approvals SET status='failed',result=$1::jsonb WHERE id=$2 AND tenant_id=$3 AND user_id=$4 AND status='executing'", json.dumps(LEGACY_FAILURE), approval, tenant, user)

    async def downstream(request):
        calls.append(request)
        assert request.headers['x-chat-approval-id'] == str(approval)
        assert request.url.path == '/api/studio/video/jobs'
        consumed = await app.state.pool.fetchval("UPDATE chat_approvals SET status='executing' WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND status='approved' RETURNING id", approval, tenant, user)
        assert consumed == approval
        await asyncio.sleep(0.05)
        if node_fail_first:
            await node_fail()
        return httpx.Response(403, json={'error': {'code': 'VIDEO_NOT_IN_PLAN', 'message': 'private provider token'}})

    try:
        with TestClient(app) as client:
            assert client.portal is not None
            app.state.pool = client.portal.call(setup)
            app.state.http._transport = httpx.MockTransport(downstream)
            endpoint = f'/approvals/{approval}/confirm'
            assert client.post(endpoint, headers=headers(uuid4(), user)).status_code == 404
            assert client.post(endpoint, headers=headers(tenant, uuid4())).status_code == 404
            assert calls == []
            auth = headers(tenant, user)
            with ThreadPoolExecutor(max_workers=2) as executor:
                requests = [executor.submit(client.post, endpoint, headers=auth) for _ in range(2)]
                responses = [future.result(timeout=10) for future in requests]
            assert all(response.status_code in (403, 502) for response in responses)
            # The second request can observe the durable in-flight claim; it
            # must never be treated as a missing proposal or resend the POST.
            refused = next(response for response in responses if response.status_code == 403)
            assert refused.json() == {'detail': {'status': 'failed', 'code': 'VIDEO_NOT_IN_PLAN', 'message': 'A criação de vídeos não está disponível no seu plano atual.'}}
            if not node_fail_first:
                client.portal.call(node_fail)
            row = client.portal.call(app.state.pool.fetchrow, 'SELECT status,result FROM chat_approvals WHERE id=$1', approval)
            assert row['status'] == 'failed'
            assert json.loads(row['result']) == {'code': 'VIDEO_NOT_IN_PLAN', 'error': refused.json()['detail']['message']}
            assert client.post(endpoint, headers=auth).status_code == 403
            assert len(calls) == 1
    finally:
        asyncio.run(cleanup())


@pytest.mark.parametrize('scenario', ['journal_inflight', 'journal_crashed', 'legacy'])
def test_conversation_poll_never_redispatches_a_journal_claim_but_legacy_can_resume(monkeypatch, scenario):
    """A read must not race the normal dispatcher for Node's one-shot consume."""
    from app import identity
    from approval_actions import ApprovalActions, ConfirmInput
    from test_attachments_postgres import database

    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')

    async def run():
        async with database() as (pool, tenant, user, cid):
            await pool.execute((Path(__file__).parents[3] / 'packages/db/migrations/0082_chat_batch_approvals.sql').read_text())
            aid = await pool.fetchval("""INSERT INTO chat_approvals
                (conversation_id,tenant_id,user_id,method,path,body,status,expires_at)
                VALUES($1,$2,$3,'POST','/api/studio/video/jobs','{}','pending',now()+interval '1 hour')
                RETURNING id""", cid, tenant, user)
            claims = {'tenantId': tenant, 'userId': user, 'humanIntent': True}
            calls = []
            accepted = {'jobId': str(aid)}

            async def node(request):
                calls.append((request.method, request.url.path))
                if request.method == 'GET':
                    row = await pool.fetchrow('SELECT status FROM chat_approvals WHERE id=$1', aid)
                    if row['status'] == 'completed':
                        return httpx.Response(200, json={'jobId': str(aid), 'status': 'pending'})
                    return httpx.Response(404, json={'error': 'not submitted'})
                assert request.method == 'POST'
                consumed = await pool.fetchval("""UPDATE chat_approvals SET status='executing',execution_started_at=now()
                    WHERE id=$1 AND status='approved' RETURNING id""", aid)
                assert consumed == aid, 'GET stole the consume from the durable dispatcher'
                # Model Node's authoritative completion of submission, not media.
                await pool.execute("UPDATE chat_approvals SET status='completed',result=$1::jsonb WHERE id=$2",
                                   json.dumps(accepted), aid)
                return httpx.Response(202, json=accepted)

            application = create_app()
            application.dependency_overrides[identity] = lambda: claims
            async with application.router.lifespan_context(application):
                application.state.pool = pool
                application.state.http._transport = httpx.MockTransport(node)
                actions = ApprovalActions(pool, application.state.http, 'https://ady.invalid', claims)
                items = None
                if scenario == 'legacy':
                    await pool.execute("UPDATE chat_approvals SET status='approved' WHERE id=$1", aid)
                else:
                    review = await actions.review(cid, [aid])
                    body = ConfirmInput(**{key: review[key] for key in ('reviewToken', 'version', 'digest', 'approvalIds')})
                    items = await actions.claim(cid, body)
                    if scenario == 'journal_crashed':
                        await pool.execute("UPDATE chat_approval_effects SET claimed_at=now()-interval '6 minutes'")
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application),
                                             base_url='https://chat.invalid',
                                             headers={'Authorization': 'Bearer delegated'}) as client:
                    response = await client.get(f'/conversations/{cid}')
                    assert response.status_code == 200, response.text
                    await asyncio.sleep(0.02)
                    if application.state.tasks:
                        await asyncio.gather(*tuple(application.state.tasks))
                    posts = [call for call in calls if call[0] == 'POST']
                    assert len(posts) == (1 if scenario == 'legacy' else 0)
                    assert any(method == 'GET' for method, _ in calls), 'Job status reads must remain allowed'
                    if scenario == 'journal_inflight':
                        assert await pool.fetchval('SELECT status FROM chat_approvals WHERE id=$1', aid) == 'approved'
                        await actions.dispatch(items[0], 'Bearer delegated')
                        assert (await actions.results(body.reviewToken))[str(aid)]['status'] == 'processing'
                    polled = await client.get(f'/conversations/{cid}')
                    assert polled.status_code == 200, polled.text
                    await asyncio.sleep(0.02)
                    assert len([call for call in calls if call[0] == 'POST']) == (0 if scenario == 'journal_crashed' else 1)
                    if scenario == 'journal_crashed':
                        assert await pool.fetchval('SELECT state FROM chat_approval_effects WHERE approval_id=$1', aid) == 'claimed'
    asyncio.run(run())
