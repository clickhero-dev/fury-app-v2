import asyncio
import httpx
import pytest
from model_request_budget import create_budgeted_http_client, durable_budget_scope, provider_retry_scope


def test_every_fallback_send_reserves_durable_budget_and_denial_never_sends():
    async def scenario():
        charged, sent = [], []
        async def charge(tokens):
            charged.append(tokens)
            if len(charged) == 2:
                raise ValueError('durable denied')
        async def respond(request):
            sent.append(request)
            return httpx.Response(503)
        async with create_budgeted_http_client(transport=httpx.MockTransport(respond)) as client:
            with durable_budget_scope(charge), provider_retry_scope():
                with pytest.raises(ValueError, match='durable denied'):
                    await client.post('https://model.invalid/chat/completions',json={'model':'synthetic','messages':[]})
        assert len(sent) == 1
        assert len(charged) == 2 and charged[0] > 4096
    asyncio.run(scenario())
