"""Regressão Python -> HTTP Node -> mesmo Postgres; apenas storage é simulado.

Run explicitly (missing/unsafe DB is an error, never a silent skip):
PYTHONPATH=apps/chat PYTHON_DOTENV_DISABLED=1 CHAT_MEDIA_TEST_DATABASE_URL=postgresql://.../chat_isolated \
  python -m pytest apps/chat/tests/test_deletion_cross_service.py -v
Requires workspace Node dependencies/tsx, asyncpg, httpx, pytest. No providers/Redis.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import signal
from pathlib import Path
import subprocess
import time
from urllib.parse import urlparse
from uuid import uuid4

import httpx
import pytest

from attachment_context import AttachmentClient
from conversation_repository import ConversationRepository
from test_attachments_postgres import database, attach

ROOT = Path(__file__).resolve().parents[3]
SECRET = 'synthetic-cross-service-delegation-secret-only'
HUMAN_SECRET = 'synthetic-cross-service-human-secret-only'


def token(tenant, user, *, delegated=True, secret=None):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=')
    claims: dict[str, object] = dict(tenantId=str(tenant), userId=str(user), email='test@example.test', role='admin',
                  iat=int(time.time()), exp=int(time.time()) + 240)
    if delegated:
        claims.update(actor='chatbot', iss='ady-api', aud=['ady-chat', 'ady-api'])
    data = encode(dict(alg='HS256', typ='JWT')) + b'.' + encode(claims)
    signature = hmac.new((secret or (SECRET if delegated else HUMAN_SECRET)).encode(), data, hashlib.sha256).digest()
    return (data + b'.' + base64.urlsafe_b64encode(signature).rstrip(b'=')).decode()


def stop_node(process):
    # tsx may spawn a Node child; terminate only this test's dedicated process group.
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=10)


@pytest.fixture
def node_server():
    url = os.environ.get('CHAT_MEDIA_TEST_DATABASE_URL', '')
    parsed = urlparse(url)
    if parsed.hostname != '127.0.0.1' or not parsed.path.endswith('_isolated'):
        pytest.fail('CHAT_MEDIA_TEST_DATABASE_URL must target an explicit disposable 127.0.0.1/*_isolated DB')

    async def start(pool):
        schema = await pool.fetchval('SELECT current_schema()')
        env = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR') if key in os.environ}
        env.update(NODE_ENV='test', DATABASE_URL=url, TEST_DATABASE_URL=url,
                   CHAT_MEDIA_TEST_DATABASE_URL=url, CHAT_DELETION_TEST_SCHEMA=schema,
                   JWT_SECRET=HUMAN_SECRET, JWT_REFRESH_SECRET=HUMAN_SECRET,
                   CHAT_DELEGATION_SECRET=SECRET, DOTENV_CONFIG_PATH='/dev/null',
                   PYTHON_DOTENV_DISABLED='1', POSTHOG_DISABLED='true')
        process = subprocess.Popen([str(ROOT / 'node_modules/.bin/tsx'),
            'apps/api/src/__tests__/chat-deletion-cross-service-server.ts'], cwd=ROOT,
            env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            start_new_session=True)
        assert process.stdout is not None
        # Read readiness off-thread, bounded even if an import crashes or hangs.
        async def ready():
            while True:
                line = await asyncio.to_thread(process.stdout.readline)
                if not line:
                    raise AssertionError(f'Node exited {process.poll()} before readiness')
                if line.startswith('{"port":'):
                    return 'http://127.0.0.1:' + str(json.loads(line)['port'])
                print('Node:', line.rstrip())
        try:
            base = await asyncio.wait_for(ready(), 30)
            return process, base
        except BaseException:
            await asyncio.to_thread(stop_node, process)
            process.stdout.close()
            raise
    return start


async def scenario(node_server, action):
    async with database() as (pool, tenant, user, cid):
        process, base = await node_server(pool)
        try:
            aid = await attach(pool, tenant, user, cid)
            repo = ConversationRepository(pool, tenant, user)
            run, _, mid = await repo.begin_run(cid, 'anexo privado', attachment_ids=[aid])
            await pool.execute("UPDATE chat_response_runs SET status='completed' WHERE id=$1", run)
            async with httpx.AsyncClient(timeout=10, trust_env=False) as http:
                client = AttachmentClient(base, token(tenant, user), http)
                await action(pool, repo, client, http, base, tenant, user, cid, aid, mid)
        finally:
            await asyncio.to_thread(stop_node, process)
            print(process.stdout.read())
            process.stdout.close()


def test_exclusao_python_node_nao_reentra_no_lock_e_so_remove_rows_apos_cleanup(node_server):
    async def action(pool, repo, client, http, base, tenant, user, cid, aid, mid):
        await asyncio.wait_for(repo.delete(cid, lambda: client.cleanup(cid)), 8)
        state = (await http.get(base + '/__test/state')).json()
        assert len(state['deletes']) == 1
        assert state['deletes'][0]['attachments'] == 1
        assert state['deletes'][0]['messages'] == 1
        for table in ('chat_conversations', 'chat_attachments', 'chat_messages'):
            assert await pool.fetchval(f'SELECT count(*) FROM {table}') == 0
    asyncio.run(scenario(node_server, action))


def test_humano_nao_pode_apagar_objetos_associados_nem_simular_delegacao(node_server):
    async def action(pool, repo, client, http, base, tenant, user, cid, aid, mid):
        response = await http.delete(client.path(cid), headers={
            'Authorization': 'Bearer ' + token(tenant, user, delegated=False),
            'X-Chat-Delegated': 'true', 'X-Chat-Actor': 'chatbot'})
        assert response.status_code == 409
        assert response.json()['error']['code'] == 'CHAT_ATTACHMENT_BOUND'
        assert (await http.get(base + '/__test/state')).json()['deletes'] == []
        assert await pool.fetchval('SELECT message_id FROM chat_attachments WHERE id=$1', aid) == mid
    asyncio.run(scenario(node_server, action))


def test_cleanup_falho_preserva_historico_e_vinculos_para_retry(node_server):
    async def action(pool, repo, client, http, base, tenant, user, cid, aid, mid):
        await pool.execute("UPDATE chat_attachments SET storage_key='fail-synthetic-object' WHERE id=$1", aid)
        with pytest.raises(httpx.HTTPStatusError) as error:
            await repo.delete(cid, lambda: client.cleanup(cid))
        assert error.value.response.status_code == 503
        assert await pool.fetchval('SELECT message_id FROM chat_attachments WHERE id=$1', aid) == mid
        assert await pool.fetchval('SELECT count(*) FROM chat_conversations WHERE id=$1', cid) == 1
        assert await pool.fetchval('SELECT count(*) FROM chat_messages WHERE id=$1', mid) == 1
        assert await pool.fetchval('SELECT status FROM chat_response_runs WHERE user_message_id=$1', mid) == 'completed'
        await pool.execute("UPDATE chat_attachments SET storage_key='recovered-synthetic-object' WHERE id=$1", aid)
        await repo.delete(cid, lambda: client.cleanup(cid))
        assert await pool.fetchval('SELECT count(*) FROM chat_conversations') == 0
    asyncio.run(scenario(node_server, action))


@pytest.mark.parametrize('foreign', ['tenant', 'user'])
def test_delegacao_verificada_nao_ultrapassa_tenant_nem_usuario(node_server, foreign):
    from attachment_repository import ConversationError
    async def action(pool, repo, client, http, base, tenant, user, cid, aid, mid):
        other_tenant, other_user = (uuid4(), user) if foreign == 'tenant' else (tenant, uuid4())
        headers = {'Authorization': 'Bearer ' + token(other_tenant, other_user)}
        response = await http.delete(client.path(cid), headers=headers)
        assert response.status_code == 404
        async def unexpected():
            raise AssertionError('foreign Python owner cannot reach cleanup')
        with pytest.raises(ConversationError) as error:
            await ConversationRepository(pool, other_tenant, other_user).delete(cid, unexpected)
        assert error.value.status_code == 404
        assert (await http.get(base + '/__test/state')).json()['deletes'] == []
        assert await pool.fetchval('SELECT message_id FROM chat_attachments WHERE id=$1', aid) == mid
    asyncio.run(scenario(node_server, action))


def test_cleanup_delegado_nao_remove_metadados_por_conta_propria(node_server):
    async def action(pool, repo, client, http, base, tenant, user, cid, aid, mid):
        await client.cleanup(cid)
        assert await pool.fetchval('SELECT message_id FROM chat_attachments WHERE id=$1', aid) == mid
        assert await pool.fetchval('SELECT count(*) FROM chat_conversations WHERE id=$1', cid) == 1
        assert await pool.fetchval('SELECT count(*) FROM chat_messages WHERE id=$1', mid) == 1
        assert len((await http.get(base + '/__test/state')).json()['deletes']) == 1
    asyncio.run(scenario(node_server, action))


def test_assinatura_falsa_e_token_humano_com_actor_forjado_nao_delegam(node_server):
    async def action(pool, repo, client, http, base, tenant, user, cid, aid, mid):
        for forged in (token(tenant, user, secret='wrong-signing-secret'),
                       token(tenant, user, secret=HUMAN_SECRET)):
            response = await http.delete(client.path(cid), headers={'Authorization': 'Bearer ' + forged})
            assert response.status_code in (401, 409)
        assert (await http.get(base + '/__test/state')).json()['deletes'] == []
        assert await pool.fetchval('SELECT message_id FROM chat_attachments WHERE id=$1', aid) == mid
    asyncio.run(scenario(node_server, action))


def test_humano_limpa_apenas_rascunhos_sob_lock(node_server):
    async def action(pool, repo, client, http, base, tenant, user, cid, aid, mid):
        await pool.execute('UPDATE chat_attachments SET message_id=NULL WHERE id=$1', aid)
        async with pool.acquire() as conn:
            async with conn.transaction():
                await repo.lock_owned(conn, cid)
                task = asyncio.create_task(http.delete(client.path(cid), headers={
                    'Authorization': 'Bearer ' + token(tenant, user, delegated=False)}))
                await asyncio.sleep(0.15)
                assert not task.done()
                assert (await http.get(base + '/__test/state')).json()['deletes'] == []
        assert (await task).status_code == 204
        assert await pool.fetchval('SELECT count(*) FROM chat_attachments') == 0
        assert await pool.fetchval('SELECT count(*) FROM chat_conversations') == 1
        assert await pool.fetchval('SELECT count(*) FROM chat_messages') == 1
    asyncio.run(scenario(node_server, action))
