"""Funcionalidade: confirmação com recusa conhecida e segura
Cenário: plano recusa vídeo depois da proposta
Dado uma aprovação pendente e uma recusa VIDEO_NOT_IN_PLAN
Quando o usuário confirma uma vez
Então recebe HTTP403 com motivo fixo persistido e não repete o efeito
"""
import json
import time
from uuid import UUID

import httpx
import jwt
import pytest
from fastapi.testclient import TestClient

from app import create_app

SECRET = 'test-confirmation-secret-at-least-32-characters'
TENANT = UUID('11111111-1111-4111-8111-111111111111')
USER = UUID('22222222-2222-4222-8222-222222222222')
APPROVAL = UUID('33333333-3333-4333-8333-333333333333')
MESSAGE = 'A criação de vídeos não está disponível no seu plano atual.'


def headers(tenant=TENANT, user=USER):
    now = int(time.time())
    token = jwt.encode({'actor': 'chatbot', 'tenantId': str(tenant), 'userId': str(user),
                        'email': 'test@example.invalid', 'role': 'admin', 'iat': now,
                        'exp': now + 300, 'iss': 'ady-api', 'aud': 'ady-chat'}, SECRET, algorithm='HS256')
    return {'Authorization': 'Bearer ' + token}


class ApprovalPool:
    """Stateful port substitute; actual SQL predicates also run on isolated PostgreSQL."""
    def __init__(self):
        self.status = 'pending'
        self.result = None
        self.writes = []
        self.path = '/api/studio/video/jobs'

    async def fetchrow(self, query, *args):
        self.writes.append((query, args))
        if "SET status='approved'" in query:
            if args != (APPROVAL, TENANT, USER) or self.status != 'pending':
                return None
            self.status = 'approved'
            return {'body': '{}', 'path': self.path, 'method': 'POST'}
        if "SET status='failed'" in query:
            payload, approval, tenant, user, *rest = args
            assert (approval, tenant, user) == (APPROVAL, TENANT, USER)
            self.status, self.result = 'failed', json.loads(payload)
            return {'id': APPROVAL}
        raise AssertionError('Unexpected repository write')

    async def execute(self, query, *args):
        self.writes.append((query, args))
        return 'UPDATE 0'

    async def close(self):
        pass


def test_known_refusal_is_persisted_and_returned_without_repeating(monkeypatch):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    pool, calls = ApprovalPool(), []
    def downstream(request):
        calls.append(request)
        assert request.method == 'POST'
        assert request.headers['x-chat-approval-id'] == str(APPROVAL)
        assert request.extensions['timeout']['read'] == 120
        return httpx.Response(403, json={'error': {'code': 'VIDEO_NOT_IN_PLAN', 'message': 'secret token <script>provider credits</script>'}})
    app = create_app()
    with TestClient(app) as client:
        app.state.pool = pool
        app.state.http._transport = httpx.MockTransport(downstream)
        response = client.post(f'/approvals/{APPROVAL}/confirm', headers=headers())
        assert response.status_code == 403
        assert response.json() == {'detail': {'status': 'failed', 'code': 'VIDEO_NOT_IN_PLAN', 'message': MESSAGE}}
        assert pool.status == 'failed'
        assert pool.result == {'code': 'VIDEO_NOT_IN_PLAN', 'error': MESSAGE}
        assert client.post(f'/approvals/{APPROVAL}/confirm', headers=headers()).status_code == 404
    assert len(calls) == 1


# Cenário: toda recusa allowlisted passa pelo contrato HTTP e persiste a cópia fixa.
# Dado código real, quando confirma, então não revela texto do provedor.
@pytest.mark.parametrize('code,message', [
    ('VIDEO_QUOTA_EXCEEDED', 'O limite de criação de vídeos deste período foi atingido.'),
    ('MODIFICATION_QUOTA_EXCEEDED', 'O limite de alterações deste vídeo foi atingido.'),
    ('SERVICE_BLOCKED', 'Esta ação não está disponível para sua conta.'),
])
def test_other_known_refusals_use_the_same_contract(monkeypatch, code, message):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    app, pool = create_app(), ApprovalPool()
    with TestClient(app) as client:
        app.state.pool = pool
        app.state.http._transport = httpx.MockTransport(lambda _: httpx.Response(403, json={'error': {'code': code, 'message': 'secret provider'}}))
        response = client.post(f'/approvals/{APPROVAL}/confirm', headers=headers())
        assert response.status_code == 403
        assert response.json() == {'detail': {'status': 'failed', 'code': code, 'message': message}}
        assert pool.result == {'code': code, 'error': message}


# Cenário: status desconhecido ou transporte incerto não vira recusa comercial.
# Dado erro não classificado, quando confirma, então retorna 502 e não repete POST.
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
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    app, pool, calls = create_app(), ApprovalPool(), []
    def downstream(request):
        calls.append(request)
        if status == 'timeout':
            raise httpx.ReadTimeout('secret provider', request=request)
        if status == 'disconnect':
            raise httpx.RemoteProtocolError('secret provider', request=request)
        return httpx.Response(status, json=payload) if payload is not None else httpx.Response(status, text='not json secret')
    with TestClient(app) as client:
        app.state.pool = pool
        app.state.http._transport = httpx.MockTransport(downstream)
        response = client.post(f'/approvals/{APPROVAL}/confirm', headers=headers())
        assert response.status_code == 502
        assert 'secret' not in response.text
        assert 'failed' not in response.text
        assert pool.result is None
        assert client.post(f'/approvals/{APPROVAL}/confirm', headers=headers()).status_code == 404
    assert len(calls) == 1


# Cenário: persistência indisponível impede afirmar uma recusa registrada.
# Dado escrita falha ou estado mudou, quando confirma, então recebe 502 seguro.
@pytest.mark.parametrize('failure', ['exception', 'no_match', 'all_db_writes'])
def test_persistence_failure_never_claims_a_durable_outcome(monkeypatch, failure):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    class FailingPool(ApprovalPool):
        async def fetchrow(self, query, *args):
            if "SET status='failed'" in query:
                if failure == 'no_match':
                    return None
                raise RuntimeError('private database details')
            return await super().fetchrow(query, *args)
        async def execute(self, query, *args):
            if failure == 'all_db_writes':
                raise RuntimeError('private database details')
            return await super().execute(query, *args)
    app, pool, calls = create_app(), FailingPool(), []
    def downstream(request):
        calls.append(request)
        return httpx.Response(403, json={'error': {'code': 'VIDEO_NOT_IN_PLAN'}})
    with TestClient(app, raise_server_exceptions=False) as client:
        app.state.pool = pool
        app.state.http._transport = httpx.MockTransport(downstream)
        response = client.post(f'/approvals/{APPROVAL}/confirm', headers=headers())
        assert response.status_code == 502
        assert isinstance(response.json()['detail'], str)
        assert 'private' not in response.text
        assert pool.result is None
        assert client.post(f'/approvals/{APPROVAL}/confirm', headers=headers()).status_code == 404
    assert len(calls) == 1


# Cenário: entrada inválida, identidade ausente e outro proprietário não acionam a API.
# Dado um pedido sem escopo válido, quando confirma, então rejeita antes do efeito.
@pytest.mark.parametrize('identifier,identity,status', [
    ('not-a-uuid', 'owner', 400), (str(APPROVAL), 'none', 401),
    (str(APPROVAL), 'other_tenant', 404), (str(APPROVAL), 'other_user', 404),
    ('44444444-4444-4444-8444-444444444444', 'owner', 404),
])
def test_invalid_or_foreign_confirmation_has_no_effect(monkeypatch, identifier, identity, status):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    app, pool, calls = create_app(), ApprovalPool(), []
    def downstream(request):
        calls.append(request)
        return httpx.Response(202, json={'jobId': str(APPROVAL)})
    other = UUID('55555555-5555-4555-8555-555555555555')
    auth = {} if identity == 'none' else headers(tenant=other if identity == 'other_tenant' else TENANT, user=other if identity == 'other_user' else USER)
    with TestClient(app) as client:
        app.state.pool = pool
        app.state.http._transport = httpx.MockTransport(downstream)
        assert client.post(f'/approvals/{identifier}/confirm', headers=auth).status_code == status
    assert calls == []
    assert pool.status == 'pending'


# Cenário: conflito 409 mantém orientação para nova proposta sem executar de novo.
# Dado snapshot obsoleto, quando confirma, então preserva o contrato de conflito.
def test_conflict_contract_is_preserved(monkeypatch):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    app, pool = create_app(), ApprovalPool()
    with TestClient(app) as client:
        app.state.pool = pool
        app.state.http._transport = httpx.MockTransport(lambda _: httpx.Response(409, json={'error': 'secret'}))
        response = client.post(f'/approvals/{APPROVAL}/confirm', headers=headers())
        assert response.status_code == 409
        assert response.json() == {'detail': 'O recurso mudou. Solicite uma nova proposta antes de confirmar.'}
        assert pool.result is None


# Cenário: sucesso e job assíncrono continuam retornando o resultado existente.
# Dado resposta bem sucedida, quando confirma, então preserva status e contrato.
@pytest.mark.parametrize('status,expected', [(200, 'completed'), (202, 'processing')])
def test_success_and_async_jobs_are_unchanged(monkeypatch, status, expected):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    app, pool, calls = create_app(), ApprovalPool(), []
    result = {'jobId': str(APPROVAL)} if status == 202 else {'url': 'https://media.invalid/image.png'}
    def downstream(request):
        calls.append(request)
        return httpx.Response(status, json=result)
    with TestClient(app) as client:
        app.state.pool = pool
        app.state.http._transport = httpx.MockTransport(downstream)
        response = client.post(f'/approvals/{APPROVAL}/confirm', headers=headers())
        assert response.status_code == 200
        assert response.json() == {'status': expected, 'result': result}
        assert client.post(f'/approvals/{APPROVAL}/confirm', headers=headers()).status_code == 404
    assert len(calls) == 1
