"""Real Agno, HTTP transport and PostgreSQL; no external provider calls."""
import asyncio
import json
from pathlib import Path

import httpx
import pytest
from agno.agent import Agent
from agno.models.openrouter import OpenRouter

from conversation_repository import ConversationRepository
from guided_setup import GuidedSetupTools
from guided_setup_persistence import GuidedSetupPersistence
from model_request_budget import create_budgeted_http_client, mark_provider_output, provider_retry_scope
from streaming import checked_agent_events
from test_attachments_postgres import URL, database

pytestmark = pytest.mark.skipif(not URL, reason='isolated PostgreSQL required')


def test_provider_failure_after_answer_recovers_without_advancing_twice(monkeypatch):
    import model_request_budget

    async def no_wait(_):
        pass
    monkeypatch.setattr(model_request_budget.asyncio, 'sleep', no_wait)

    async def scenario():
        async with database() as (pool, tenant, user, cid):
            migrations = Path(__file__).resolve().parents[3] / 'packages/db/migrations'
            for name in ('0084_chat_guided_setups.sql', '0085_chat_guided_setup_receipts.sql',
                         '0086_chat_guided_profile_effects.sql'):
                await pool.execute((migrations / name).read_text())
            run, lease, mid = await ConversationRepository(pool, tenant, user).begin_run(cid, 'Sim')
            repository = GuidedSetupPersistence(pool, tenant, user, cid, run, lease, mid)
            await repository.capture_snapshot()
            setup = GuidedSetupTools(repository)
            requests, output = [], []

            def chunk(delta, reason=None):
                return 'data: ' + json.dumps({'id': '1', 'choices': [
                    {'index': 0, 'delta': delta, 'finish_reason': reason}]}) + '\n\n'

            def handler(request):
                requests.append(json.loads(request.content)['messages'])
                if len(requests) == 1:
                    data = chunk({'tool_calls': [{'index': 0, 'id': 't1', 'type': 'function',
                        'function': {'name': 'guided_setup_answer', 'arguments': '{"answer":"Sim"}'}}]}) + chunk({}, 'tool_calls')
                elif len(requests) == 2:
                    return httpx.Response(503, json={'error': {'message': 'private'}})
                else:
                    data = chunk({'content': 'Qual é o nome do seu negócio?'}) + chunk({}, 'stop')
                return httpx.Response(200, headers={'content-type': 'text/event-stream'}, content=data + 'data: [DONE]\n\n')

            async def hook(function, args):
                mark_provider_output()
                return await function(**args)

            async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as http:
                agent = Agent(model=OpenRouter(id='synthetic', api_key='synthetic', http_client=http,
                              max_retries=0, retries=0), tools=[setup.guided_setup_answer],
                              tool_hooks=[hook], telemetry=False)
                with provider_retry_scope() as state:
                    async for event in checked_agent_events(agent.arun('Sim', stream=True), state):
                        if isinstance(getattr(event, 'content', None), str):
                            output.append(event.content)
            assert len(requests) == 3
            assert requests[1] == requests[2]
            assert ''.join(output) == 'Qual é o nome do seu negócio?'
            assert await pool.fetchval('SELECT step FROM chat_guided_setups') == 'business_name'
            assert await pool.fetchval('SELECT count(*) FROM chat_guided_setup_receipts') == 1
    asyncio.run(scenario())
