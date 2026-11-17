"""Funcionalidade: título automático de conversas
Cenário: geração de título usa a mesma proteção de requisição do chat
Dado um cliente HTTP de modelo com orçamento validado
Quando o título é gerado
Então o agente usa esse cliente antes de qualquer chamada externa
"""
import os
import asyncio
import time
from uuid import UUID

import jwt
import pytest
from fastapi.testclient import TestClient

from app import create_app

SECRET = 'test-secret-with-at-least-32-characters'
CID = '33333333-3333-4333-8333-333333333333'
TENANT = '22222222-2222-4222-8222-222222222222'
USER = '11111111-1111-4111-8111-111111111111'


def headers():
    now = int(time.time())
    token = jwt.encode({'actor': 'chatbot', 'userId': USER, 'tenantId': TENANT, 'iat': now, 'exp': now + 300, 'email': 'test@example.invalid', 'role': 'admin', 'iss': 'ady-api', 'aud': 'ady-chat'}, SECRET, algorithm='HS256')
    return {'Authorization': 'Bearer ' + token}


def test_rename_persists_with_authenticated_owner(monkeypatch):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    class Pool:
        async def fetchrow(self, query, *args):
            assert args == (UUID(CID), UUID(TENANT), UUID(USER), 'Meu título')
            return {'id': UUID(CID), 'title': args[3]}
        async def close(self): pass
    app = create_app()
    with TestClient(app) as client:
        app.state.pool = Pool()
        response = client.patch('/conversations/' + CID, headers=headers(), json={'title': '  Meu título  '})
        assert response.status_code == 200
        assert response.json() == {'id': CID, 'title': 'Meu título'}


@pytest.mark.parametrize('title', ['', '   ', 'a' * 121, 7, 'linha\nquebra'])
def test_invalid_title_is_rejected(monkeypatch, title):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    with TestClient(create_app()) as client:
        assert client.patch('/conversations/' + CID, headers=headers(), json={'title': title}).status_code == 400


def test_rename_requires_authentication():
    with TestClient(create_app()) as client:
        assert client.patch('/conversations/' + CID, json={'title': 'Nome'}).status_code == 401


def test_rename_other_owner_is_not_found(monkeypatch):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    class Pool:
        async def fetchrow(self, query, *args):
            assert 'tenant_id=$2 AND user_id=$3' in query
            return None
        async def close(self): pass
    app = create_app()
    with TestClient(app) as client:
        app.state.pool = Pool()
        assert client.patch('/conversations/' + CID, headers=headers(), json={'title': 'Nova conversa'}).status_code == 404

def test_auto_title_survives_manual_default_rename_race():
    from conversation_titles import generate_title
    class Repo:
        manual = False
        title = 'Nova conversa'
        async def set_automatic(self, cid, title):
            if self.manual:
                return None
            self.title = title
            return {'id': cid, 'title': title}
    repo = Repo()
    async def model(_user, _assistant):
        repo.manual = True
        return 'Título gerado'
    assert asyncio.run(generate_title(repo, CID, 'Olá', 'Resposta', model)) is None
    assert repo.title == 'Nova conversa'

def test_auto_title_falls_back_when_model_fails():
    from conversation_titles import generate_title
    class Repo:
        async def set_automatic(self, cid, title):
            return {'id': cid, 'title': title}
    async def model(_user, _assistant):
        raise RuntimeError('offline')
    result = asyncio.run(generate_title(Repo(), CID, '  Quero criar campanha  ', 'Resposta', model))
    assert result['title'] == 'Quero criar campanha'


def test_repository_uses_owner_and_atomic_title_source_condition():
    from conversation_repository import ConversationRepository
    class DB:
        async def fetchrow(self, query, *args):
            assert "title_source='pending'" in query
            assert 'tenant_id=$2 AND user_id=$3' in query
            assert args == (CID, TENANT, USER, 'Gerado')
            return None
    assert asyncio.run(ConversationRepository(DB(), TENANT, USER).set_automatic(CID, 'Gerado')) is None


def test_empty_model_result_uses_clean_fallback():
    from conversation_titles import generate_title
    class Repo:
        async def set_automatic(self, cid, title): return {'title': title}
    async def empty(*_): return '  \n  '
    result = asyncio.run(generate_title(Repo(), CID, 'Criar\n campanha', 'Resposta', empty))
    assert result['title'] == 'Criar campanha'


def test_title_timeout_uses_fallback(monkeypatch):
    import conversation_titles
    original = asyncio.wait_for
    async def short_timeout(awaitable, timeout):
        return await original(awaitable, timeout=0.01)
    monkeypatch.setattr(conversation_titles.asyncio, 'wait_for', short_timeout)
    class Repo:
        async def set_automatic(self, cid, title): return {'title': title}
    async def slow(*_):
        await asyncio.sleep(1)
        return 'não deve aparecer'
    result = asyncio.run(conversation_titles.generate_title(Repo(), CID, 'Título fallback', 'Resposta', slow))
    assert result['title'] == 'Título fallback'


def test_title_model_uses_budgeted_http_client(monkeypatch):
    import conversation_titles
    from types import SimpleNamespace

    captured = {}

    class Model:
        def __init__(self, **kwargs): captured.update(kwargs)

    class Agent:
        def __init__(self, *, model, instructions): captured['model'] = model
        async def arun(self, _prompt): return SimpleNamespace(content='Título seguro')

    monkeypatch.setattr('agno.models.openrouter.OpenRouter', Model)
    monkeypatch.setattr('agno.agent.Agent', Agent)
    client = object()
    result = asyncio.run(conversation_titles.model_title('Olá', 'Resposta', http_client=client))
    assert captured['http_client'] is client
    assert result == 'Título seguro'
