"""Pure safety regressions: never open a database for an unsafe URL."""
import asyncio
from unittest.mock import AsyncMock

import pytest
import test_attachments_postgres as attachments


@pytest.mark.parametrize('url', [
    None, '', 'postgresql://sentinel.invalid/production',
    'postgresql://127.0.0.1/production',
    'postgresql://sentinel.invalid/chat_isolated',
    'https://127.0.0.1/chat_isolated',
    'postgresql://127.0.0.1/chat_isolated?host=sentinel.invalid',
])
def test_database_rejects_unsafe_url_before_connect_or_schema(monkeypatch, url):
    admin = AsyncMock()
    connect = AsyncMock(return_value=admin)
    monkeypatch.setattr(attachments, 'URL', url)
    monkeypatch.setattr(attachments.asyncpg, 'connect', connect)

    async def scenario():
        # Stop immediately if the helper wrongly reaches the first SQL write.
        admin.execute.side_effect = AssertionError('unsafe schema write')
        with pytest.raises(ValueError, match='disposable'):
            async with attachments.database():
                pytest.fail('unsafe database yielded')

    asyncio.run(scenario())
    connect.assert_not_called()
    admin.execute.assert_not_called()


@pytest.mark.parametrize('url', [
    'postgresql://chatbot:synthetic@127.0.0.1:54321/chatbot_ci_isolated',
    'postgres://127.0.0.1/chat_isolated',
])
def test_database_accepts_explicit_loopback_disposable_url(monkeypatch, url):
    connect = AsyncMock(side_effect=RuntimeError('mock connection boundary'))
    monkeypatch.setattr(attachments, 'URL', url)
    monkeypatch.setattr(attachments.asyncpg, 'connect', connect)

    async def scenario():
        with pytest.raises(RuntimeError, match='mock connection boundary'):
            async with attachments.database():
                pytest.fail('mock connection must stop before SQL')

    asyncio.run(scenario())
    connect.assert_awaited_once_with(url)
