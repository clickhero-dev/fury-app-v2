"""Single and batch routes share the durable effect journal, never legacy dispatch."""
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest
import app as chat


@pytest.fixture
def approval_runtime(monkeypatch):
    tenant, user, approval = uuid4(), uuid4(), uuid4()
    state = {'human': True, 'outcome': {'status': 'completed', 'result': {'id': 'post'}}, 'calls': []}
    class Pool:
        async def fetchrow(self, *args): return None
        async def close(self): pass
    class Actions:
        def __init__(self, pool, http, base_url, identity):
            assert identity['tenantId'] == tenant and identity['userId'] == user
        async def confirm_single(self, approval_id, authorization):
            state['calls'].append((approval_id, authorization))
            if state.get('error'):
                raise state['error']
            return {'id': str(approval_id), **state['outcome']}
    monkeypatch.setattr(chat, 'ApprovalActions', Actions, raising=False)
    monkeypatch.setenv('ADY_API_URL', 'https://node.invalid')
    app = chat.create_app()
    app.dependency_overrides[chat.identity] = lambda: {
        'tenantId': tenant, 'userId': user, 'humanIntent': state['human'],
    }
    with TestClient(app) as client:
        app.state.pool = Pool()
        yield client, approval, state


def confirm(runtime):
    client, approval, _ = runtime
    return client.post(f'/approvals/{approval}/confirm', headers={'Authorization': 'Bearer synthetic'})


def test_single_uses_shared_journal_and_duplicate_success_is_safe(approval_runtime):
    _, approval, state = approval_runtime
    first, second = confirm(approval_runtime), confirm(approval_runtime)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {'status': 'completed', 'result': {'id': 'post'}}
    assert state['calls'] == [(approval, 'Bearer synthetic')] * 2


def test_model_delegation_cannot_confirm(approval_runtime):
    _, _, state = approval_runtime
    state['human'] = False
    assert confirm(approval_runtime).status_code == 403
    assert not state['calls']


@pytest.mark.parametrize('code', ['VIDEO_NOT_IN_PLAN', 'VIDEO_QUOTA_EXCEEDED', 'MODIFICATION_QUOTA_EXCEEDED', 'SERVICE_BLOCKED'])
def test_known_refusal_uses_fixed_copy(approval_runtime, code):
    from action_outcomes import ActionRefusal
    _, _, state = approval_runtime
    state['outcome'] = {'status': 'failed', 'result': {'code': code, 'error': 'private provider text'}}
    response = confirm(approval_runtime)
    assert response.status_code == 403
    assert response.json() == {'detail': ActionRefusal(code).detail()}
    assert 'private' not in response.text


def test_resource_changed_requires_new_review(approval_runtime):
    _, _, state = approval_runtime
    state['outcome'] = {'status': 'failed', 'result': {'code': 'CHAT_RESOURCE_CHANGED'}}
    assert confirm(approval_runtime).status_code == 409


@pytest.mark.parametrize('outcome', [
    {'status': 'unknown', 'result': {'error': 'private'}},
    {'status': 'failed', 'result': {'code': 'not_allowlisted', 'error': 'private'}},
    {'status': 'completed', 'result': None},
    {'status': 'completed', 'result': {'error': 'private'}},
])
def test_ambiguous_results_are_not_success(approval_runtime, outcome):
    _, _, state = approval_runtime
    state['outcome'] = outcome
    response = confirm(approval_runtime)
    assert response.status_code == 502
    assert 'private' not in response.text


def test_persistence_failure_is_sanitized(approval_runtime):
    _, _, state = approval_runtime
    state['error'] = RuntimeError('private database diagnostic')
    response = confirm(approval_runtime)
    assert response.status_code == 502
    assert 'private' not in response.text


def test_lookup_and_expiry_errors_preserve_contract(approval_runtime):
    _, _, state = approval_runtime
    state['error'] = HTTPException(404, 'Proposta não encontrada')
    assert confirm(approval_runtime).status_code == 404


def test_batch_router_is_mounted_and_human_gate_precedes_database():
    app = chat.create_app()
    app.dependency_overrides[chat.identity] = lambda: {
        'tenantId': uuid4(), 'userId': uuid4(), 'humanIntent': False,
    }
    with TestClient(app) as client:
        response = client.post(f'/conversations/{uuid4()}/approvals/review',
                               json={'approvalIds': [str(uuid4())]})
        assert response.status_code == 403
