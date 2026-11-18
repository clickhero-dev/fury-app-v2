import asyncio
import json
from uuid import uuid4

import httpx
import pytest

from assistant_metrics import report_assistant_event


def test_metric_has_only_allowlisted_measurements_and_hashed_operation():
    async def run():
        sent = []
        operation = uuid4()
        async def handler(request):
            sent.append(json.loads(request.content))
            return httpx.Response(200)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert await report_assistant_event(
                client, 'https://telemetry.invalid', 'synthetic-key',
                event='draft_ready', operation_id=operation, latency_ms=900, attempts=2,
                input_mode='choice',
            )
        payload = sent[0]
        assert payload['event'] == 'ady_draft_ready'
        properties = payload['properties']
        assert set(properties) == {'distinct_id', 'operation', 'latency_ms', 'attempts', 'input_mode', '$insert_id'}
        assert str(operation) not in json.dumps(payload)
        assert len(properties['operation']) == 64
        assert properties['latency_ms'] == 900
    asyncio.run(run())


def test_repeated_confirmation_uses_same_telemetry_deduplication_key():
    async def run():
        sent, operation = [], uuid4()
        async def handler(request):
            sent.append(json.loads(request.content)['properties'])
            return httpx.Response(200)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            for _ in range(2):
                await report_assistant_event(
                    client, 'https://telemetry.invalid', 'synthetic-key',
                    event='approval_completed', operation_id=operation,
                )
        assert sent[0]['$insert_id'] == sent[1]['$insert_id']
    asyncio.run(run())


@pytest.mark.parametrize('changes', [
    {'event': 'private user message'}, {'operation_id': 'tenant@example.invalid'},
    {'latency_ms': -1}, {'latency_ms': float('nan')}, {'latency_ms': True},
    {'attempts': 101}, {'attempts': True}, {'input_mode': 'private free text'},
])
def test_invalid_measurements_are_dropped_without_network(changes):
    async def run():
        sent = []
        async def handler(request):
            sent.append(request)
            return httpx.Response(200)
        values = {'event': 'started', 'operation_id': uuid4(), **changes}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert not await report_assistant_event(
                client, 'https://telemetry.invalid', 'synthetic-key', **values,
            )
        assert not sent
    asyncio.run(run())


def test_no_key_disables_reporting_and_metrics_failure_does_not_break_turn(caplog):
    async def run():
        sent = []
        async def handler(request):
            sent.append(request)
            raise httpx.ReadTimeout('private sensitive diagnostics')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert not await report_assistant_event(
                client, 'https://telemetry.invalid', '', event='started', operation_id=uuid4(),
            )
            assert not sent
            assert not await report_assistant_event(
                client, 'https://telemetry.invalid', 'synthetic-key',
                event='failed', operation_id=uuid4(),
            )
        assert len(sent) == 1
    asyncio.run(run())
    assert 'private sensitive' not in caplog.text


def test_http_refusal_is_not_reported_as_success():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(503),
        )) as client:
            assert not await report_assistant_event(
                client, 'https://telemetry.invalid', 'synthetic-key',
                event='recovered', operation_id=uuid4(),
            )
    asyncio.run(run())
