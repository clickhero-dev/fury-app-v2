"""Empty model streams must not become successful attachment-notice responses."""
import time
from types import SimpleNamespace
from uuid import uuid4

import agno.agent
import httpx
import jwt
import pytest
from fastapi.testclient import TestClient
import app as chat


@pytest.mark.parametrize('model_text', [''])
def test_notice_does_not_complete_empty_model_response_and_retry_is_read_only(monkeypatch, model_text):
    tenant, user, cid = uuid4(), uuid4(), uuid4()
    now = int(time.time())
    secret = 'test-secret-with-at-least-32-characters'
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', secret)
    monkeypatch.setenv('ADY_API_URL', 'https://node.invalid')
    monkeypatch.setenv('MODEL_CHATBOT', 'synthetic')
    token = jwt.encode({'actor':'chatbot', 'tenantId':str(tenant), 'userId':str(user), 'email':'test@example.invalid', 'role':'admin', 'iat':now, 'exp':now+300, 'iss':'ady-api', 'aud':'ady-chat'}, secret, algorithm='HS256')
    completions, failures, calls, reads, requests = [], [], [], [], []
    scopes = ['ads_management', 'ads_read', 'pages_show_list', 'pages_manage_ads']

    async def backend(request):
        requests.append(request)
        if request.url.path == '/api/studio/chat-quotas':
            return httpx.Response(200, json={'data': {'subscription':'expired', 'images':None, 'videos':None, 'secret':'private'}})
        if request.url.path == '/api/meta/chat-ads-diagnostic':
            return httpx.Response(200, json={'data': {'status':'partial', 'checks':{'adsAndPagesPermissions':'confirmed', 'account':'inactive', 'page':'missing_advertise', 'token':'private'}, 'permissionScopes':scopes}})
        raise AssertionError('unexpected route')

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
        async def load(self, *args, **kwargs): return SimpleNamespace(notice='Arquivo omitido. ', readings=[])
    class Agent:
        def __init__(self, **kwargs): self.options = kwargs
        def arun(self, messages, stream=False):
            calls.append(self.options)
            async def events():
                for tool in self.options['tools']:
                    if getattr(tool, '__name__', '') in ('quotas', 'meta_ads_diagnostic'):
                        reads.append(await tool())
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
        application.state.http._transport = httpx.MockTransport(backend)
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
        names = [[getattr(tool, '__name__', None) or tool.name for tool in call['tools']] for call in calls]
        for registered in names:
            assert registered.count('quotas') == 1
            assert registered.count('meta_ads_diagnostic') == 1
        for call in calls:
            registered = [tool for tool in call['tools'] if getattr(tool, '__name__', '') in ('quotas', 'meta_ads_diagnostic')]
            assert len(registered) == 2
            assert all(tool.__self__.token == token for tool in registered)
            assert all(tool.__self__.client is application.state.http for tool in registered)
        assert 'create_plan' in names[0]
        assert 'create_plan' not in names[1]
        assert reads == [
            {'subscription':'expired', 'images':None, 'videos':None},
            {'status':'partial', 'checks':{'adsAndPagesPermissions':'confirmed', 'account':'inactive', 'page':'missing_advertise'}, 'permissionScopes':scopes},
        ] * 2
        assert len(requests) == 4
        assert all(request.headers['authorization'] == 'Bearer '+token and not request.url.query for request in requests)
        assert all('private' not in str(result) for result in reads)
