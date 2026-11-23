"""HTTP contracts through the shared single/batch journal on disposable PostgreSQL.

Only provider HTTP is simulated: no paid operation or obsolete SQL-string fake.
"""
import asyncio
from contextlib import contextmanager
import json
import os
from pathlib import Path
import time
from uuid import UUID, uuid4

import asyncpg
import httpx
import jwt
import pytest
from fastapi.testclient import TestClient

from app import create_app
from approval_actions import ApprovalActions

SECRET = 'test-confirmation-secret-at-least-32-characters'
TENANT = UUID('11111111-1111-4111-8111-111111111111')
USER = UUID('22222222-2222-4222-8222-222222222222')
APPROVAL = UUID('33333333-3333-4333-8333-333333333333')
MESSAGE = 'A criação de vídeos não está disponível no seu plano atual.'


def headers(tenant=TENANT, user=USER, *, human=True):
    now = int(time.time())
    token = jwt.encode({'actor': 'chatbot', 'tenantId': str(tenant), 'userId': str(user),
                        'email': 'test@example.invalid', 'role': 'admin', 'iat': now,
                        'exp': now + 300, 'iss': 'ady-api', 'aud': 'ady-chat',
                        'humanIntent': human}, SECRET, algorithm='HS256')
    return {'Authorization': 'Bearer ' + token}


@contextmanager
def runtime(monkeypatch, downstream, *, path='/api/studio/video/jobs'):
    url = os.getenv('CHAT_OUTCOME_TEST_DATABASE_URL')
    if not url:
        pytest.fail('Set CHAT_OUTCOME_TEST_DATABASE_URL to the disposable PostgreSQL test database.')
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    schema, conversation = 'confirmation_' + uuid4().hex, uuid4()

    async def setup():
        conn = await asyncpg.connect(url)
        try:
            await conn.execute('CREATE SCHEMA ' + schema)
            await conn.execute('SET search_path TO ' + schema)
            await conn.execute("""CREATE TABLE chat_conversations(id uuid PRIMARY KEY,tenant_id uuid,user_id uuid);
                CREATE TABLE chat_approvals(id uuid PRIMARY KEY,tenant_id uuid,user_id uuid,
                  conversation_id uuid REFERENCES chat_conversations(id),method text,path text,body jsonb,
                  display jsonb,status text,expires_at timestamptz,result jsonb);
            """)
            await conn.execute('INSERT INTO chat_conversations VALUES($1,$2,$3)', conversation, TENANT, USER)
            await conn.execute("""INSERT INTO chat_approvals VALUES($1,$2,$3,$4,
                'POST',$5,'{}',NULL,'pending',now()+interval '1 hour',NULL)""",
                APPROVAL, TENANT, USER, conversation, path)
            await conn.execute((Path(__file__).parents[3] / 'packages/db/migrations/0082_chat_batch_approvals.sql').read_text())
        finally:
            await conn.close()
        return await asyncpg.create_pool(url, min_size=1, max_size=4, server_settings={'search_path': schema})

    async def cleanup():
        conn = await asyncpg.connect(url)
        try:
            await conn.execute('DROP SCHEMA ' + schema + ' CASCADE')
        finally:
            await conn.close()

    app = create_app()
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            app.state.pool = client.portal.call(setup)
            app.state.http._transport = httpx.MockTransport(downstream)
            yield client, app.state.pool, conversation
    finally:
        asyncio.run(cleanup())


def confirm(client, **kwargs):
    return client.post(f'/approvals/{APPROVAL}/confirm', headers=headers(), **kwargs)


def persisted(client, pool):
    row = client.portal.call(pool.fetchrow, 'SELECT status,result FROM chat_approvals WHERE id=$1', APPROVAL)
    return row['status'], json.loads(row['result']) if row['result'] else None


def test_known_refusal_is_persisted_and_returned_without_repeating(monkeypatch):
    calls = []
    def downstream(request):
        calls.append(request)
        assert request.method == 'POST'
        assert request.headers['x-chat-approval-id'] == str(APPROVAL)
        assert request.extensions['timeout']['read'] == 120
        return httpx.Response(403, json={'error': {'code': 'VIDEO_NOT_IN_PLAN', 'message': 'secret token <script>provider credits</script>'}})
    with runtime(monkeypatch, downstream) as (client, pool, _):
        response = confirm(client)
        assert response.status_code == 403
        assert response.json() == {'detail': {'status': 'failed', 'code': 'VIDEO_NOT_IN_PLAN', 'message': MESSAGE}}
        assert persisted(client, pool) == ('failed', {'code': 'VIDEO_NOT_IN_PLAN', 'error': MESSAGE})
        replay = confirm(client)
        assert replay.status_code == 403
        assert replay.json() == response.json()
    assert len(calls) == 1


@pytest.mark.parametrize('code,message', [
    ('VIDEO_QUOTA_EXCEEDED', 'O limite de criação de vídeos deste período foi atingido.'),
    ('MODIFICATION_QUOTA_EXCEEDED', 'O limite de alterações deste vídeo foi atingido.'),
    ('SERVICE_BLOCKED', 'Esta ação não está disponível para sua conta.'),
])
def test_other_known_refusals_use_the_same_contract(monkeypatch, code, message):
    with runtime(monkeypatch, lambda _: httpx.Response(403, json={'error': {'code': code, 'message': 'secret provider'}})) as (client, pool, _):
        response = confirm(client)
        assert response.status_code == 403
        assert response.json() == {'detail': {'status': 'failed', 'code': code, 'message': message}}
        assert persisted(client, pool) == ('failed', {'code': code, 'error': message})
        assert confirm(client).json() == response.json()


@pytest.mark.parametrize('status,payload', [
    (400, {'error': {'code': 'VIDEO_NOT_IN_PLAN'}}),
    (401, {'error': {'code': 'SERVICE_BLOCKED'}}),
    (403, {'error': {'code': 'UNRECOGNIZED', 'message': 'secret provider'}}),
    (403, {'error': 'VIDEO_NOT_IN_PLAN secret'}),
    (404, {'error': {'code': 'VIDEO_NOT_IN_PLAN'}}),
    (429, {'error': {'code': 'VIDEO_QUOTA_EXCEEDED'}}),
    (502, {'error': {'code': 'VIDEO_NOT_IN_PLAN'}}),
    (503, {'detail': '<script>secret</script>'}),
    (403, None), (200, None), ('timeout', None), ('disconnect', None),
])
def test_unknown_failure_is_safe_and_not_automatically_retried(monkeypatch, status, payload):
    calls = []
    def downstream(request):
        calls.append(request)
        if status == 'timeout':
            raise httpx.ReadTimeout('secret provider', request=request)
        if status == 'disconnect':
            raise httpx.RemoteProtocolError('secret provider', request=request)
        return httpx.Response(status, json=payload) if payload is not None else httpx.Response(status, text='not json secret')
    with runtime(monkeypatch, downstream) as (client, pool, _):
        response = confirm(client)
        assert response.status_code == 502
        assert 'secret' not in response.text
        assert 'failed' not in response.text
        state, result = persisted(client, pool)
        assert state in ('failed', 'unknown')
        assert 'secret' not in json.dumps(result)
        if state == 'unknown':
            assert result['code'] == 'CHAT_OUTCOME_UNCONFIRMED'
        assert confirm(client).status_code == 502
    assert len(calls) == 1


@pytest.mark.parametrize('failure', ['effect_journal', 'approval_record', 'all_db_writes'])
def test_persistence_failure_never_claims_a_durable_outcome(monkeypatch, failure):
    calls = []
    def downstream(request):
        calls.append(request)
        return httpx.Response(403, json={'error': {'code': 'VIDEO_NOT_IN_PLAN'}})
    with runtime(monkeypatch, downstream) as (client, pool, _):
        if failure == 'all_db_writes':
            async def unavailable(*_args):
                raise RuntimeError('private database details')
            monkeypatch.setattr(ApprovalActions, 'persist', unavailable)
        else:
            target = 'chat_approval_effects' if failure == 'effect_journal' else 'chat_approvals'
            predicate = '' if failure == 'effect_journal' else "WHEN (NEW.status='failed')"
            client.portal.call(pool.execute, f"""CREATE FUNCTION fail_result() RETURNS trigger LANGUAGE plpgsql AS
                $$ BEGIN RAISE EXCEPTION 'private database details'; END $$;
                CREATE TRIGGER fail_result BEFORE UPDATE ON {target} FOR EACH ROW {predicate} EXECUTE FUNCTION fail_result()""")
        response = confirm(client)
        assert response.status_code == 502
        assert isinstance(response.json()['detail'], str)
        assert 'private' not in response.text
        assert persisted(client, pool) == ('approved', None)
        assert client.portal.call(pool.fetchval, "SELECT state FROM chat_approval_effects WHERE approval_id=$1", APPROVAL) == 'claimed'
        assert confirm(client).status_code == 502
    assert len(calls) == 1


@pytest.mark.parametrize('identifier,identity,status', [
    ('not-a-uuid', 'owner', 400), (str(APPROVAL), 'none', 401),
    (str(APPROVAL), 'other_tenant', 404), (str(APPROVAL), 'other_user', 404),
    ('44444444-4444-4444-8444-444444444444', 'owner', 404),
    (str(APPROVAL), 'agent', 403),
])
def test_invalid_or_foreign_confirmation_has_no_effect(monkeypatch, identifier, identity, status):
    calls = []
    def downstream(request):
        calls.append(request)
        return httpx.Response(202, json={'jobId': str(APPROVAL)})
    other = UUID('55555555-5555-4555-8555-555555555555')
    auth = {} if identity == 'none' else headers(
        tenant=other if identity == 'other_tenant' else TENANT,
        user=other if identity == 'other_user' else USER, human=identity != 'agent')
    with runtime(monkeypatch, downstream) as (client, pool, _):
        assert client.post(f'/approvals/{identifier}/confirm', headers=auth).status_code == status
        assert persisted(client, pool) == ('pending', None)
        assert client.portal.call(pool.fetchval, 'SELECT count(*) FROM chat_approval_effects') == 0
    assert not calls


def test_conflict_contract_is_preserved(monkeypatch):
    calls = []
    def downstream(request):
        calls.append(request)
        return httpx.Response(409, json={'error': 'secret'})
    with runtime(monkeypatch, downstream) as (client, pool, _):
        response = confirm(client)
        assert response.status_code == 409
        assert response.json() == {'detail': 'O recurso mudou. Solicite uma nova proposta antes de confirmar.'}
        assert persisted(client, pool)[1]['code'] == 'CHAT_RESOURCE_CHANGED'
        assert confirm(client).status_code == 409
    assert len(calls) == 1


@pytest.mark.parametrize('status,expected', [(200, 'completed'), (202, 'processing')])
def test_success_and_async_jobs_are_unchanged(monkeypatch, status, expected):
    calls = []
    result = {'jobId': str(APPROVAL)} if status == 202 else {'url': 'https://media.invalid/image.png'}
    def downstream(request):
        calls.append(request)
        return httpx.Response(status, json=result)
    path = '/api/studio/video/jobs' if status == 202 else '/api/studio/ai/generate-image'
    with runtime(monkeypatch, downstream, path=path) as (client, _, _):
        response = confirm(client)
        assert response.status_code == 200
        assert response.json() == {'status': expected, 'result': result}
        replay = confirm(client)
        assert replay.status_code == 200
        assert replay.json() == response.json()
    assert len(calls) == 1


def test_single_and_batch_through_app_share_real_claim_and_results(monkeypatch):
    calls = []
    result = {'id': str(APPROVAL)}
    def downstream(request):
        calls.append(request)
        return httpx.Response(200, json=result)
    with runtime(monkeypatch, downstream, path='/api/studio/ai/generate-image') as (client, pool, cid):
        prefix = f'/conversations/{cid}/approvals'
        review = client.post(prefix + '/review', headers=headers(), json={'approvalIds': [str(APPROVAL)]})
        assert review.status_code == 200
        body = {key: review.json()[key] for key in ('reviewToken', 'version', 'digest', 'approvalIds')}
        batch = client.post(prefix + '/confirm-batch', headers=headers(), json=body)
        assert batch.status_code == 200
        assert batch.json()['items'] == [{'id': str(APPROVAL), 'status': 'completed', 'result': result}]
        assert confirm(client).json() == {'status': 'completed', 'result': result}
        assert client.post(prefix + '/confirm-batch', headers=headers(), json=body).json() == batch.json()
        assert persisted(client, pool) == ('completed', result)
        assert client.portal.call(pool.fetchval, 'SELECT count(*) FROM chat_approval_effects') == 1
    assert len(calls) == 1
