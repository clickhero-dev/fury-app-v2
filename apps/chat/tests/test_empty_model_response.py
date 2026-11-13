"""Empty model streams must not become successful attachment-notice responses."""
import time
from types import SimpleNamespace
from uuid import uuid4

import agno.agent
import jwt
import pytest
from fastapi.testclient import TestClient
import app as chat


@pytest.mark.parametrize('model_text', ['', '  \n'])
def test_notice_does_not_complete_empty_model_response_and_retry_is_read_only(monkeypatch, model_text):
    tenant, user, cid = uuid4(), uuid4(), uuid4()
    now = int(time.time())
    secret = 'test-secret-with-at-least-32-characters'
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', secret)
    monkeypatch.setenv('ADY_API_URL', 'https://node.invalid')
    monkeypatch.setenv('MODEL_CHATBOT', 'synthetic')
    token = jwt.encode({'actor':'chatbot', 'tenantId':str(tenant), 'userId':str(user), 'email':'test@example.invalid', 'role':'admin', 'iat':now, 'exp':now+300, 'iss':'ady-api', 'aud':'ady-chat'}, secret, algorithm='HS256')
    completions, failures, calls = [], [], []

    class Pool:
        async def fetchrow(self, *args): return {'id': cid}
        async def fetch(self, *args): return []
        async def execute(self, query, *args): failures.append(query)
        async def close(self): pass
    class Repository:
        def __init__(self, *args): pass
        async def begin_run(self, *args, **kwargs): return uuid4(), uuid4(), uuid4()
        async def memories(self, *args): return []
        async def history(self, *args): return [{'role':'user', 'content':'Analise'}]
    class Fence:
        def __init__(self, *args): pass
        async def complete(self, cid, content):
            completions.append(content)
            return {'id':str(uuid4()), 'role':'assistant', 'content':content}
    class Context:
        def __init__(self, *args): pass
        async def load(self, *args): return SimpleNamespace(notice='Arquivo omitido. ', readings=[])
    class Agent:
        def __init__(self, **kwargs): self.options = kwargs
        def arun(self, messages, stream=False):
            calls.append(self.options)
            async def events():
                if model_text: yield SimpleNamespace(content=model_text)
            return events()
    async def no_consolidation(*args, **kwargs): return False
    monkeypatch.setattr(chat, 'ConversationRepository', Repository)
    monkeypatch.setattr(chat, 'FencedDB', Fence)
    monkeypatch.setattr(chat, 'AttachmentContext', Context)
    monkeypatch.setattr(chat, 'consolidate', no_consolidation)
    monkeypatch.setattr(chat, 'generate_title', no_consolidation)
    monkeypatch.setattr(agno.agent, 'Agent', Agent)
    application = chat.create_app()
    with TestClient(application) as client:
        application.state.pool = Pool()
        headers = {'Authorization':'Bearer '+token}
        response = client.post(f'/conversations/{cid}/messages', headers=headers, json={'content':'Analise'})
        assert 'Arquivo omitido' in response.text
        assert 'event: error' in response.text
        assert 'event: done' not in response.text
        assert completions == []
        assert len(failures) == 1 and "status='failed'" in failures[0]
        response = client.post(f'/conversations/{cid}/retry', headers=headers)
        assert 'event: error' in response.text and 'event: done' not in response.text
        assert completions == []
        assert len(calls) == 2
        assert all(not tool.__name__.startswith('propose_') for tool in calls[1]['tools'])
