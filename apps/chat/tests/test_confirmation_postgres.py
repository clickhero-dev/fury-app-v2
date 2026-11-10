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
    approval, tenant, user = uuid4(), uuid4(), uuid4()
    app, calls = create_app(), []

    async def setup():
        conn = await asyncpg.connect(URL)
        try:
            await conn.execute('CREATE SCHEMA ' + schema)
            await conn.execute('CREATE TABLE ' + schema + '''.chat_approvals(
                id uuid PRIMARY KEY,tenant_id uuid,user_id uuid,method text,path text,
                body jsonb,display jsonb,status text,expires_at timestamptz,result jsonb)''')
            await conn.execute('INSERT INTO ' + schema + ".chat_approvals VALUES($1,$2,$3,'POST','/api/studio/video/jobs','{}',NULL,'pending',now()+interval '1 hour',NULL)", approval, tenant, user)
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
            assert sorted(response.status_code for response in responses) == [403, 404]
            refused = next(response for response in responses if response.status_code == 403)
            assert refused.json() == {'detail': {'status': 'failed', 'code': 'VIDEO_NOT_IN_PLAN', 'message': 'A criação de vídeos não está disponível no seu plano atual.'}}
            if not node_fail_first:
                client.portal.call(node_fail)
            row = client.portal.call(app.state.pool.fetchrow, 'SELECT status,result FROM chat_approvals WHERE id=$1', approval)
            assert row['status'] == 'failed'
            assert json.loads(row['result']) == {'code': 'VIDEO_NOT_IN_PLAN', 'error': refused.json()['detail']['message']}
            assert client.post(endpoint, headers=auth).status_code == 404
            assert len(calls) == 1
    finally:
        asyncio.run(cleanup())
