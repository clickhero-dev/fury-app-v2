"""Optional lifecycle observations; never send prompts, identity or diagnostics."""
from hashlib import sha256
import logging
from uuid import UUID

import httpx

EVENTS = frozenset((
    'started', 'draft_ready', 'clarification_shown', 'failed',
    'recovered', 'cancelled', 'approval_completed',
))
INPUT_MODES = frozenset(('unknown', 'typed', 'quick_action', 'choice', 'retry'))
log = logging.getLogger('ady.chat')


async def report_assistant_event(
    client, host, key, *, event, operation_id, latency_ms=0, attempts=0, input_mode='unknown',
):
    if not key:
        return False
    try:
        operation = str(UUID(str(operation_id)))
        if (event not in EVENTS or input_mode not in INPUT_MODES
                or type(latency_ms) is not int or not 0 <= latency_ms <= 86400000
                or type(attempts) is not int or not 0 <= attempts <= 100):
            return False
    except (ValueError, TypeError, AttributeError):
        return False
    payload = {
        'api_key': key,
        'event': 'ady_' + event,
        'properties': {
            'distinct_id': 'ady-assistant',
            'operation': sha256(operation.encode()).hexdigest(),
            '$insert_id': sha256(f'{operation}:{event}:{attempts}'.encode()).hexdigest(),
            'latency_ms': latency_ms,
            'attempts': attempts,
            'input_mode': input_mode,
        },
    }
    try:
        response = await client.post(host.rstrip('/') + '/capture/', json=payload, timeout=1.0)
        response.raise_for_status()
        return True
    except httpx.HTTPError:
        log.warning('Métrica do assistente indisponível')
        return False
