"""Real PostgreSQL run admission through two concurrent ASGI WebSockets."""
import asyncio
import json
import os
import time
from pathlib import Path
from uuid import UUID, uuid4

import jwt
import pytest

import app as chat
import test_attachments_postgres as fixtures
from websocket_transport import issue_ticket


pytestmark = pytest.mark.skipif(not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'), reason='banco isolado ausente')


def test_same_key_and_payload_admitted_once(monkeypatch):
    async def run():
        secret = 'test-secret-with-at-least-32-characters'
        monkeypatch.setenv('CHAT_DELEGATION_SECRET', secret)
        monkeypatch.setenv('CHAT_WS_ALLOWED_ORIGINS', 'https://app.example.invalid')
        async with fixtures.database() as (db, tenant, user_id, cid):
            sql = (Path(__file__).resolve().parents[3] / 'packages/db/migrations/0085_chat_websocket_tickets.sql').read_text()
            await db.execute(sql)
            now = int(time.time())
            raw = jwt.encode({'actor': 'chatbot', 'userId': str(user_id), 'tenantId': str(tenant),
                              'email': 'u@example.invalid', 'role': 'admin', 'iat': now, 'exp': now + 300,
                              'iss': 'ady-api', 'aud': ['ady-chat', 'ady-api']}, secret, algorithm='HS256')
            user = chat.identity('Bearer ' + raw)
            ticket_a, ticket_b = await asyncio.gather(issue_ticket(db, user, secret), issue_ticket(db, user, secret))
            release = asyncio.Event()

            async def events():
                await release.wait()
                yield 'event: done\ndata: {}\n\n'

            monkeypatch.setattr(chat, 'start_stream', lambda *_: events())
            service = chat.create_app()
            async with service.router.lifespan_context(service):
                service.state.pool = db
                key = str(uuid4())
                async def socket(ticket):
                    incoming = asyncio.Queue()
                    outgoing = asyncio.Queue()
                    await incoming.put({'type': 'websocket.connect'})
                    await incoming.put({'type': 'websocket.receive', 'text': json.dumps({
                        'ticket': ticket, 'path': f'/conversations/{cid}/messages',
                        'body': {'content': 'mesmo pedido', 'clientKey': key},
                    })})
                    scope = {'type': 'websocket', 'asgi': {'version': '3.0', 'spec_version': '2.3'},
                             'path': '/ws', 'raw_path': b'/ws', 'query_string': b'',
                             'headers': [(b'origin', b'https://app.example.invalid')], 'subprotocols': [],
                             'scheme': 'ws', 'server': ('test', 80), 'client': ('test', 1)}
                    task = asyncio.create_task(service(scope, incoming.get, outgoing.put))
                    assert (await asyncio.wait_for(outgoing.get(), 5))['type'] == 'websocket.accept'
                    message = await asyncio.wait_for(outgoing.get(), 5)
                    return json.loads(message['text']), task

                results = await asyncio.gather(socket(ticket_a), socket(ticket_b))
                frames = [result[0] for result in results]
                assert sorted(frame['event'] for frame in frames) == ['ack', 'error']
                error = next(frame for frame in frames if frame['event'] == 'error')
                assert error['data']['status'] == 409
                assert await db.fetchval('SELECT count(*) FROM chat_messages WHERE conversation_id=$1', cid) == 1
                assert await db.fetchval('SELECT count(*) FROM chat_response_runs WHERE conversation_id=$1 AND client_key=$2', cid, UUID(key)) == 1
                release.set()
                await asyncio.gather(*(result[1] for result in results))
                service.state.pool = None  # fixture owns the shared pool
    asyncio.run(run())
