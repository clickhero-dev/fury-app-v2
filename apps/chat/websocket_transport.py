"""One-use distributed WebSocket tickets and strict request decoding."""
import hashlib
import json
import re
import secrets
import time
from urllib.parse import urlsplit, parse_qsl
from uuid import UUID

import jwt
from pydantic import ValidationError


TICKET_TTL_SECONDS = 30
_UUID = r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'
_PATH = re.compile(rf'^/conversations/({_UUID})/(messages|retry|clarifications/({_UUID})/answer)$')


def ticket_hash(ticket):
    return hashlib.sha256(ticket.encode('ascii')).digest()


async def issue_ticket(db, user, secret):
    ticket = secrets.token_urlsafe(32)
    expiry = user['exp']
    claims = {key: str(user[key]) if key in ('userId', 'tenantId') else user[key]
              for key in ('userId', 'tenantId', 'email', 'role', 'actor', 'iat')}
    claims.update({'iss': 'ady-api', 'aud': 'ady-ws-ticket',
                   'exp': min(int(time.time()) + TICKET_TTL_SECONDS, expiry),
                   'delegation_exp': expiry, 'jti': ticket_hash(ticket).hex()})
    # Ticket assertions cannot be used as tool delegations (different audience).
    assertion = jwt.encode(claims, secret, algorithm='HS256')
    await db.execute('DELETE FROM chat_websocket_tickets WHERE expires_at <= now()')
    await db.execute(
        """INSERT INTO chat_websocket_tickets (ticket_hash,assertion,expires_at)
           VALUES ($1,$2,LEAST(now() + interval '30 seconds', to_timestamp($3)))""",
        ticket_hash(ticket), assertion, expiry,
    )
    return ticket


async def consume_ticket(db, ticket, secret):
    if not isinstance(ticket, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', ticket):
        return None
    row = await db.fetchrow(
        """DELETE FROM chat_websocket_tickets WHERE ticket_hash=$1 AND expires_at > now()
           RETURNING assertion""", ticket_hash(ticket),
    )
    if not row:
        return None
    try:
        claims = jwt.decode(row['assertion'], secret, algorithms=['HS256'], audience='ady-ws-ticket',
                            issuer='ady-api', options={'require': ['exp', 'iat', 'jti', 'delegation_exp'], 'verify_iat': False})
        if not secrets.compare_digest(claims['jti'], ticket_hash(ticket).hex()):
            return None
        delegation = {key: claims[key] for key in ('userId', 'tenantId', 'email', 'role', 'actor', 'iat')}
        delegation.update({'exp': claims['delegation_exp'], 'iss': 'ady-api', 'aud': ['ady-chat', 'ady-api']})
        return jwt.encode(delegation, secret, algorithm='HS256')
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None


def decode_request(path, body, message_model, retry_model, clarification_model):
    if not isinstance(path, str) or len(path) > 512 or not isinstance(body, dict):
        raise ValueError('invalid request')
    parts = urlsplit(path)
    if parts.scheme or parts.netloc or parts.fragment:
        raise ValueError('invalid path')
    match = _PATH.fullmatch(parts.path)
    if not match:
        raise ValueError('invalid path')
    conversation_id, operation, clarification_id = match.groups()
    query = parse_qsl(parts.query, keep_blank_values=True, strict_parsing=True)
    if query and (operation != 'retry' or len(query) != 1 or query[0][0] != 'run_id'):
        raise ValueError('invalid query')
    run_id = UUID(query[0][1]) if query else None
    try:
        if operation == 'messages':
            value = message_model.model_validate(body)
            kwargs = dict(content=value.content, attachment_ids=value.attachmentIds,
                          client_key=value.clientKey, response_capabilities=value.responseCapabilities)
        elif operation == 'retry':
            value = retry_model.model_validate(body)
            kwargs = dict(retry=True, retry_run_id=run_id, client_key=value.clientKey,
                          response_capabilities=value.responseCapabilities, automatic=value.automatic)
        else:
            value = clarification_model.model_validate(body)
            kwargs = dict(client_key=value.clientKey, clarification_id=UUID(clarification_id),
                          choice_index=value.choiceIndex, response_capabilities=value.responseCapabilities)
    except ValidationError as exc:
        raise ValueError('invalid body') from exc
    if value.clientKey is None:
        raise ValueError('clientKey required')
    return UUID(conversation_id), kwargs


def decode_event(chunk):
    if isinstance(chunk, bytes):
        chunk = chunk.decode('utf-8')
    event, data = None, []
    for line in chunk.splitlines():
        if line.startswith('event:'):
            event = line[6:].lstrip()
        elif line.startswith('data:'):
            data.append(line[5:].lstrip())
    if not event or not data:
        raise ValueError('invalid event')
    return {'event': event, 'data': json.loads('\n'.join(data))}
