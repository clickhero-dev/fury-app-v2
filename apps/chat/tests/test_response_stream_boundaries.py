"""Streaming response classification and persistence regressions."""
import json
from types import SimpleNamespace
from uuid import uuid4

import agno.agent
import pytest
from fastapi.testclient import TestClient
import app as chat


def run_response(monkeypatch, chunks, *, modern=True, fail=False):
    cid, tenant, user = uuid4(), uuid4(), uuid4()
    persisted = []
    class Pool:
        async def fetchrow(self, *args): return {'id': cid}
        async def fetch(self, *args): return []
        async def execute(self, *args): pass
        async def close(self): pass
    class Repository:
        def __init__(self, *args): pass
        async def begin_run(self, *args, **kwargs): return uuid4(), uuid4(), uuid4()
        async def memories(self, *args): return []
        async def history(self, *args): return [{'role': 'user', 'content': 'Olá'}]
    class Fence:
        def __init__(self, *args): pass
        async def complete_many(self, cid, contents, *, clarification=None):
            if fail: raise RuntimeError('sensitive database failure')
            persisted.extend(contents)
            return [{'id': str(uuid4()), 'role': 'assistant', 'content': content} for content in contents]
    class Context:
        def __init__(self, *args): pass
        async def load(self, *args, **kwargs): return SimpleNamespace(notice='', readings=[])
    class Agent:
        def __init__(self, **kwargs): pass
        def arun(self, *args, **kwargs):
            async def events():
                for chunk in chunks: yield SimpleNamespace(content=chunk)
            return events()
    async def noop(*args, **kwargs): return False
    monkeypatch.setenv('ADY_API_URL', 'https://node.invalid')
    monkeypatch.setenv('MODEL_CHATBOT', 'synthetic')
    monkeypatch.setattr(chat, 'ConversationRepository', Repository)
    monkeypatch.setattr(chat, 'FencedDB', Fence)
    monkeypatch.setattr(chat, 'AttachmentContext', Context)
    monkeypatch.setattr(chat, 'consolidate', noop)
    monkeypatch.setattr(chat, 'generate_title', noop)
    monkeypatch.setattr(agno.agent, 'Agent', Agent)
    application = chat.create_app()
    application.dependency_overrides[chat.identity] = lambda: {'tenantId': tenant, 'userId': user}
    with TestClient(application) as client:
        application.state.pool = Pool()
        body = {'content': 'Olá', 'responseCapabilities': ['multi_message_v1'] if modern else []}
        response = client.post(f'/conversations/{cid}/messages', headers={'Authorization': 'Bearer test'}, json=body)
    frames = [frame.split('\n') for frame in response.text.strip().split('\n\n')]
    events = [(frame[0].removeprefix('event: '), json.loads(next(line[6:] for line in frame if line.startswith('data: ')))) for frame in frames]
    return events, persisted


@pytest.mark.parametrize('modern', [False, True])
@pytest.mark.parametrize('chunks', [
    ['\n ', 'ADY_MES', 'SAGES:{"messages":["Primeira","Segunda"]}'],
    ['  \nADY_MESSAGES:{"messages":["Primeira","Segunda"]}'],
])
def test_whitespace_prefixed_envelope_is_never_leaked(monkeypatch, modern, chunks):
    events, persisted = run_response(monkeypatch, chunks, modern=modern)
    assert all('ADY_MESSAGES' not in json.dumps(data) for _, data in events)
    done = next(data for kind, data in events if kind == 'done')
    expected = ['Primeira', 'Segunda'] if modern else ['Primeira\n\nSegunda']
    assert persisted == expected
    assert [row['content'] for row in done['messages']] == expected
    assert ''.join(data['content'] for kind, data in events if kind == 'token') == ('' if modern else expected[0])


@pytest.mark.parametrize('index', range(1, len('ADY_MESSAGES:')))
def test_marker_split_at_each_boundary(monkeypatch, index):
    marker = 'ADY_MESSAGES:'
    events, persisted = run_response(monkeypatch, ['\n', marker[:index], marker[index:], '{"messages":["ok"]}'])
    assert persisted == ['ok']
    assert not any(kind in ('error', 'token') for kind, _ in events)


def test_long_plain_response_is_streamed_once_and_persisted(monkeypatch):
    text = 'A' * 20001 + 'fim'
    events, persisted = run_response(monkeypatch, [text[:10000], text[10000:]])
    assert ''.join(data['content'] for kind, data in events if kind == 'token') == text
    assert persisted == [text]
    assert next(data for kind, data in events if kind == 'done')['message']['content'] == text
    assert not any(kind == 'error' for kind, _ in events)


def test_plain_response_at_persistence_limit_succeeds(monkeypatch):
    text = 'x' * 110000
    events, persisted = run_response(monkeypatch, [text[:55000], text[55000:]])
    assert persisted == [text]
    assert ''.join(data['content'] for kind, data in events if kind == 'token') == text
    assert any(kind == 'done' for kind, _ in events)


@pytest.mark.parametrize('chunks', [
    [' \n', 'ADY_MES', 'SAGES:{"messages":["secret"'],
    ['\nADY_MESSAGES:', '{"messages":[]}'],
])
def test_invalid_whitespace_prefixed_envelope_never_leaks(monkeypatch, chunks):
    events, persisted = run_response(monkeypatch, chunks)
    assert not persisted
    assert [kind for kind, _ in events] == ['run', 'error']
    assert 'secret' not in json.dumps(events)


@pytest.mark.parametrize('chunks', [
    [' \n', 'ADY_MES', 'sagem normal'],
    [' \n', 'ADY_MES'],
])
def test_plain_prefix_and_leading_whitespace_are_preserved(monkeypatch, chunks):
    events, persisted = run_response(monkeypatch, chunks)
    assert persisted == [''.join(chunks)]
    assert ''.join(data['content'] for kind, data in events if kind == 'token') == persisted[0]


def test_stream_limit_never_emits_the_overflowing_chunk_or_replays(monkeypatch):
    chunks = ['x' * 109999, 'y', 'private overflow']
    events, persisted = run_response(monkeypatch, chunks)
    assert not persisted
    assert ''.join(data['content'] for kind, data in events if kind == 'token') == ''.join(chunks[:2])
    assert events[-1][0] == 'error'
    assert 'private overflow' not in json.dumps(events)
    assert not any(kind == 'done' for kind, _ in events)


def test_persistence_failure_is_sanitized_and_has_no_done(monkeypatch):
    events, persisted = run_response(monkeypatch, ['plain response'], fail=True)
    assert not persisted
    assert events[-1][0] == 'error'
    assert 'sensitive database failure' not in json.dumps(events)
    assert not any(kind == 'done' for kind, _ in events)
