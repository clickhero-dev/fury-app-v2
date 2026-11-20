import hashlib
import asyncio
import threading
import time
from uuid import UUID, uuid4

import jwt
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import app as chat


SECRET = 'test-secret-with-at-least-32-characters'
USER, TENANT, CONVERSATION, RUN, CLARIFICATION = [uuid4() for _ in range(5)]


def token():
    now = int(time.time())
    return jwt.encode({'actor': 'chatbot', 'userId': str(USER), 'tenantId': str(TENANT),
                       'email': 'u@example.invalid', 'role': 'admin', 'iat': now,
                       'exp': now + 300, 'iss': 'ady-api', 'aud': ['ady-chat', 'ady-api']}, SECRET, algorithm='HS256')


class Pool:
    def __init__(self):
        self.tickets = {}
        self.owner = (TENANT, USER)

    async def execute(self, query, *args):
        if 'INSERT INTO chat_websocket_tickets' in query:
            self.tickets[args[0]] = args[1]
        return 'OK'

    async def fetchrow(self, query, *args):
        if 'DELETE FROM chat_websocket_tickets' in query:
            value = self.tickets.pop(args[0], None)
            return {'assertion': value} if value else None
        if 'FROM chat_conversations' in query:
            return {'id': args[0]} if args[1:] == self.owner else None
        raise AssertionError(query)

    async def close(self):
        pass


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv('CHAT_DELEGATION_SECRET', SECRET)
    monkeypatch.setenv('CHAT_WS_ALLOWED_ORIGINS', 'https://app.example.invalid')
    service = chat.create_app()
    with TestClient(service, headers={'origin': 'https://app.example.invalid'}) as client:
        pool = Pool()
        service.state.pool = pool
        yield client, pool, monkeypatch


def issue(client):
    response = client.post('/websocket-ticket', headers={'Authorization': 'Bearer ' + token()})
    assert response.status_code == 200
    return response.json()['ticket']


def test_ticket_requires_auth_and_never_stores_raw_ticket(setup):
    client, pool, _ = setup
    assert client.post('/websocket-ticket').status_code == 401
    ticket = issue(client)
    assert ticket not in pool.tickets
    assert hashlib.sha256(ticket.encode()).digest() in pool.tickets
    assertion = pool.tickets[hashlib.sha256(ticket.encode()).digest()]
    with pytest.raises(jwt.InvalidAudienceError):
        jwt.decode(assertion, SECRET, algorithms=['HS256'], audience='ady-api', issuer='ady-api')


def test_ticket_cannot_expand_delegation_audience(setup):
    client, _, _ = setup
    claims = jwt.decode(token(), SECRET, algorithms=['HS256'], audience='ady-chat', issuer='ady-api')
    claims['aud'] = 'ady-chat'
    restricted = jwt.encode(claims, SECRET, algorithm='HS256')
    assert client.post('/websocket-ticket', headers={'Authorization': 'Bearer ' + restricted}).status_code == 401


def test_rescued_delegation_keeps_audiences_and_expiration_without_human_intent(setup):
    from websocket_transport import consume_ticket
    client, pool, _ = setup
    original = token()
    claims = jwt.decode(original, SECRET, algorithms=['HS256'], audience='ady-api', issuer='ady-api')
    response = client.post('/websocket-ticket', headers={'Authorization': 'Bearer ' + original})
    delegated = asyncio.run(consume_ticket(pool, response.json()['ticket'], SECRET))
    recovered = jwt.decode(delegated, SECRET, algorithms=['HS256'], audience='ady-api', issuer='ady-api')
    assert recovered['aud'] == claims['aud']
    assert recovered['exp'] == claims['exp']
    assert recovered.get('humanIntent') is None


def test_ticket_single_use_and_invalid_ticket_fail_closed(setup):
    client, _, _ = setup
    ticket = issue(client)
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': ticket, 'path': '/invalid', 'body': {}})
        assert ws.receive_json()['event'] == 'error'
    for bad in (ticket, 'not-a-ticket'):
        with client.websocket_connect('/ws') as ws:
            ws.send_json({'ticket': bad, 'path': '/invalid', 'body': {}})
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()


@pytest.mark.parametrize('path,body,expected', [
    (f'/conversations/{CONVERSATION}/messages', {'content': 'Olá', 'clientKey': str(RUN), 'responseCapabilities': ['multi_message_v1']}, {'content': 'Olá', 'client_key': RUN}),
    (f'/conversations/{CONVERSATION}/retry?run_id={RUN}', {'automatic': True, 'clientKey': str(RUN)}, {'retry': True, 'retry_run_id': RUN, 'automatic': True}),
    (f'/conversations/{CONVERSATION}/clarifications/{CLARIFICATION}/answer', {'choiceIndex': 1, 'clientKey': str(RUN)}, {'clarification_id': CLARIFICATION, 'choice_index': 1}),
])
def test_routes_to_existing_generation_and_converts_events(setup, path, body, expected):
    client, _, monkeypatch = setup
    calls = []

    class Repo:
        def __init__(self, db, tenant, user):
            assert (tenant, user) == (TENANT, USER)

        async def begin_run(self, conversation, content, **kwargs):
            calls.append((conversation, content, kwargs))
            return uuid4(), uuid4(), uuid4()

    async def events():
        yield 'event: token\ndata: {"content":"olá"}\n\n'
        yield 'event: done\ndata: {"message":{"content":"ok"}}\n\n'
        yield 'event: title\ndata: {"title":"Título"}\n\n'

    monkeypatch.setattr(chat, 'ConversationRepository', Repo)
    monkeypatch.setattr(chat, 'start_stream', lambda *args: events())
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': issue(client), 'path': path, 'body': body})
        assert ws.receive_json() == {'event': 'ack', 'data': {}}
        assert ws.receive_json() == {'event': 'token', 'data': {'content': 'olá'}}
        assert ws.receive_json()['event'] == 'done'
        assert ws.receive_json() == {'event': 'title', 'data': {'title': 'Título'}}
        assert ws.receive_json() == {'event': 'end', 'data': {}}
    assert calls[0][0] == CONVERSATION
    for key, value in expected.items():
        assert (calls[0][1] if key == 'content' else calls[0][2][key]) == value


@pytest.mark.parametrize('path,body', [
    (f'/conversations/{CONVERSATION}/messages', {'content': ''}),
    (f'/conversations/{CONVERSATION}/retry?run_id=bad', {}),
    (f'/conversations/{CONVERSATION}/retry?run_id={RUN}&extra=1', {}),
    ('https://evil.invalid/conversations/x/messages', {}),
    (f'/conversations/{CONVERSATION}/clarifications/{CLARIFICATION}/answer', {'choiceIndex': -1}),
])
def test_invalid_requests_return_error(setup, path, body):
    client, _, _ = setup
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': issue(client), 'path': path, 'body': body})
        assert ws.receive_json()['event'] == 'error'


def test_other_owner_cannot_access_conversation(setup):
    client, pool, _ = setup
    pool.owner = (uuid4(), USER)
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': issue(client), 'path': f'/conversations/{CONVERSATION}/messages', 'body': {'content': 'oi', 'clientKey': str(RUN)}})
        assert ws.receive_json()['data']['status'] == 404


def test_websocket_rejects_missing_or_untrusted_origin(setup, monkeypatch):
    client, _, _ = setup
    for origin in ('https://evil.invalid', 'null', ''):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect('/ws', headers={'origin': origin}):
                pass
    monkeypatch.delenv('CHAT_WS_ALLOWED_ORIGINS')
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/ws'):
            pass


def test_expired_delegation_is_rejected_on_ticket_consumption(setup):
    client, pool, _ = setup
    ticket = issue(client)
    now = int(time.time())
    pool.tickets[hashlib.sha256(ticket.encode()).digest()] = jwt.encode({
        'actor': 'chatbot', 'userId': str(USER), 'tenantId': str(TENANT),
        'email': 'u@example.invalid', 'role': 'admin', 'iat': now - 60,
        'exp': now - 1, 'iss': 'ady-api', 'aud': 'ady-ws-ticket',
        'jti': hashlib.sha256(ticket.encode()).hexdigest(),
    }, SECRET, algorithm='HS256')
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': ticket, 'path': '/invalid', 'body': {}})
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


def test_conflict_is_returned_before_ack_without_leaking_exception(setup):
    client, _, monkeypatch = setup

    class Repo:
        def __init__(self, *args):
            pass

        async def begin_run(self, *args, **kwargs):
            raise chat.ConversationError(409, 'Já existe uma resposta.', 'run_in_progress')

    monkeypatch.setattr(chat, 'ConversationRepository', Repo)
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': issue(client), 'path': f'/conversations/{CONVERSATION}/retry', 'body': {'clientKey': str(RUN)}})
        assert ws.receive_json() == {'event': 'error', 'data': {
            'status': 409, 'message': 'Já existe uma resposta.', 'code': 'run_in_progress'}}


def test_stream_without_terminal_event_does_not_send_end(setup):
    client, _, monkeypatch = setup

    class Repo:
        def __init__(self, *args):
            pass

        async def begin_run(self, *args, **kwargs):
            return uuid4(), uuid4(), uuid4()

    async def events():
        yield 'event: token\ndata: {"content":"partial"}\n\n'

    monkeypatch.setattr(chat, 'ConversationRepository', Repo)
    monkeypatch.setattr(chat, 'start_stream', lambda *args: events())
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': issue(client), 'path': f'/conversations/{CONVERSATION}/messages', 'body': {'content': 'oi', 'clientKey': str(RUN)}})
        assert ws.receive_json()['event'] == 'ack'
        assert ws.receive_json()['event'] == 'token'
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


def test_idle_stream_sends_heartbeat_without_losing_next_event(setup):
    client, _, monkeypatch = setup
    monkeypatch.setattr(chat, 'WS_HEARTBEAT_SECONDS', .01)

    class Repo:
        def __init__(self, *args):
            pass
        async def begin_run(self, *args, **kwargs):
            return uuid4(), uuid4(), uuid4()

    async def events():
        await asyncio.sleep(.04)
        yield 'event: done\ndata: {"message":{}}\n\n'

    monkeypatch.setattr(chat, 'ConversationRepository', Repo)
    monkeypatch.setattr(chat, 'start_stream', lambda *args: events())
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': issue(client), 'path': f'/conversations/{CONVERSATION}/messages', 'body': {'content': 'oi', 'clientKey': str(RUN)}})
        assert ws.receive_json()['event'] == 'ack'
        assert ws.receive_json() == {'event': 'heartbeat', 'data': {}}
        while ws.receive_json()['event'] != 'done':
            pass
        assert ws.receive_json()['event'] == 'end'


def test_disconnect_during_idle_does_not_cancel_detached_producer(setup):
    client, _, monkeypatch = setup
    monkeypatch.setattr(chat, 'WS_HEARTBEAT_SECONDS', .01)
    started, finished = threading.Event(), threading.Event()
    real_start_stream = chat.start_stream

    class Repo:
        def __init__(self, *args):
            pass
        async def begin_run(self, *args, **kwargs):
            return uuid4(), uuid4(), uuid4()

    async def produce(emit):
        started.set()
        await asyncio.sleep(.12)
        await emit('event: done\ndata: {}\n\n')
        finished.set()

    monkeypatch.setattr(chat, 'ConversationRepository', Repo)
    monkeypatch.setattr(chat, 'start_stream', lambda tasks, _: real_start_stream(tasks, produce))
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': issue(client), 'path': f'/conversations/{CONVERSATION}/messages', 'body': {'content': 'oi', 'clientKey': str(RUN)}})
        assert ws.receive_json()['event'] == 'ack'
        assert started.wait(1)
    assert finished.wait(2)


@pytest.mark.parametrize('path,body', [
    (f'/conversations/{CONVERSATION}/messages', {'content': 'oi'}),
    (f'/conversations/{CONVERSATION}/retry', {}),
    (f'/conversations/{CONVERSATION}/clarifications/{CLARIFICATION}/answer', {'choiceIndex': 0}),
    (f'/conversations/{CONVERSATION}/messages', {'content': 'oi', 'clientKey': None}),
    (f'/conversations/{CONVERSATION}/messages', {'content': 'oi', 'clientKey': 'invalid'}),
])
def test_websocket_requires_client_key(setup, path, body):
    client, _, _ = setup
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': issue(client), 'path': path, 'body': body})
        assert ws.receive_json() == {'event': 'error', 'data': {'status': 400, 'message': 'Dados inválidos.'}}


@pytest.mark.parametrize('after_done', [False, True])
def test_invalid_stream_after_ack_closes_without_error_or_end(setup, after_done):
    client, _, monkeypatch = setup

    class Repo:
        def __init__(self, *args):
            pass
        async def begin_run(self, *args, **kwargs):
            return uuid4(), uuid4(), uuid4()

    async def events():
        if after_done:
            yield 'event: done\ndata: {}\n\n'
        yield 'malformed'

    monkeypatch.setattr(chat, 'ConversationRepository', Repo)
    monkeypatch.setattr(chat, 'start_stream', lambda *args: events())
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': issue(client), 'path': f'/conversations/{CONVERSATION}/messages',
                      'body': {'content': 'oi', 'clientKey': str(RUN)}})
        assert ws.receive_json()['event'] == 'ack'
        if after_done:
            assert ws.receive_json()['event'] == 'done'
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


@pytest.mark.parametrize('exception', [RuntimeError('private'), chat.HTTPException(409, 'conflict')])
def test_exception_after_ack_is_an_incomplete_stream(setup, exception):
    client, _, monkeypatch = setup

    class Repo:
        def __init__(self, *args):
            pass
        async def begin_run(self, *args, **kwargs):
            return uuid4(), uuid4(), uuid4()

    async def events():
        yield 'event: done\ndata: {}\n\n'
        raise exception

    monkeypatch.setattr(chat, 'ConversationRepository', Repo)
    monkeypatch.setattr(chat, 'start_stream', lambda *args: events())
    with client.websocket_connect('/ws') as ws:
        ws.send_json({'ticket': issue(client), 'path': f'/conversations/{CONVERSATION}/messages',
                      'body': {'content': 'oi', 'clientKey': str(RUN)}})
        assert ws.receive_json()['event'] == 'ack'
        assert ws.receive_json()['event'] == 'done'
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()
