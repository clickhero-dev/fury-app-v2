"""Funcionalidade: respostas claras sem omitir dados essenciais."""
import time
from types import SimpleNamespace
from uuid import uuid4

import agno.agent
import jwt
import pytest
from fastapi.testclient import TestClient
import app as chat


@pytest.mark.parametrize('model_text', ['Resposta breve.', 'Alerta importante. ' + 'Detalhe necessário. ' * 100])
def test_instrucoes_do_agente_pedem_concisao_sem_ocultar_alertas(monkeypatch, model_text):
    # Dado um pedido que pode exigir detalhes e alertas
    tenant, user, cid = uuid4(), uuid4(), uuid4()
    now = int(time.time())
    secret = 'test-secret-with-at-least-32-characters'
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', secret)
    monkeypatch.setenv('ADY_API_URL', 'https://node.invalid')
    monkeypatch.setenv('MODEL_CHATBOT', 'synthetic')
    token = jwt.encode({'actor':'chatbot', 'tenantId':str(tenant), 'userId':str(user), 'email':'test@example.invalid', 'role':'admin', 'iat':now, 'exp':now+300, 'iss':'ady-api', 'aud':'ady-chat'}, secret, algorithm='HS256')
    captured, persisted = [], []
    class Pool:
        async def fetchrow(self, *args): return {'id': cid}
        async def fetch(self, *args): return []
        async def execute(self, *args): pass
        async def close(self): pass
    class Repository:
        def __init__(self, *args): pass
        async def begin_run(self, *args, **kwargs): return uuid4(), uuid4(), uuid4()
        async def memories(self, *args): return []
        async def history(self, *args): return [{'role':'user', 'content':'Explique os riscos'}]
    class Fence:
        def __init__(self, *args): pass
        async def complete_many(self, cid, contents, *, clarification=None):
            persisted.extend(contents)
            return [{'id':str(uuid4()), 'role':'assistant', 'content':content} for content in contents]
    class Context:
        def __init__(self, *args): pass
        async def load(self, *args, **kwargs): return SimpleNamespace(notice='', readings=[])
    class Agent:
        def __init__(self, **kwargs): captured.append(kwargs)
        def arun(self, messages, stream=False):
            async def events(): yield SimpleNamespace(content=model_text)
            return events()
    async def noop(*args, **kwargs): return False
    monkeypatch.setattr(chat, 'ConversationRepository', Repository)
    monkeypatch.setattr(chat, 'FencedDB', Fence)
    monkeypatch.setattr(chat, 'AttachmentContext', Context)
    monkeypatch.setattr(chat, 'consolidate', noop)
    monkeypatch.setattr(chat, 'generate_title', noop)
    monkeypatch.setattr(agno.agent, 'Agent', Agent)
    application = chat.create_app()
    with TestClient(application) as client:
        application.state.pool = Pool()
        # Quando o modelo recebe a solicitação
        response = client.post(f'/conversations/{cid}/messages', headers={'Authorization':'Bearer '+token}, json={'content':'Explique os riscos'})
        assert 'event: done' in response.text
        assert persisted == [model_text]
    # Então clareza e brevidade não sobrepõem segurança ou informações necessárias
    instructions = ' '.join(captured[0]['instructions']).lower()
    assert 'clara' in instructions and 'concisa' in instructions
    assert 'alertas' in instructions and 'detalhes essenciais' in instructions
    assert 'não afirme que uma ação foi executada' in instructions
