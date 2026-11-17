import asyncio
import json
from uuid import uuid4

import pytest

from attachment_repository import ConversationError
from conversation_repository import ConversationRepository
from app import create_app


@pytest.mark.parametrize('duplicate,expected_code', [(False, 'retry_compacted'), (True, None)])
def test_retry_conflicts_distinguish_compaction_from_duplicate(duplicate, expected_code):
    class Connection:
        async def __aenter__(self): return self
        async def __aexit__(self, *_): pass
        def transaction(self): return self
        async def execute(self, *_): pass
        async def fetchval(self, sql, *_):
            if 'FOR UPDATE' in sql: return uuid4()
            if 'INSERT INTO chat_send_keys' in sql: return None if duplicate else uuid4()
            if 'chat_memories' in sql: return 1
            raise AssertionError(sql)
    class Pool:
        def acquire(self): return Connection()

    async def run():
        repo = ConversationRepository(Pool(), uuid4(), uuid4())
        with pytest.raises(ConversationError) as caught:
            await repo.begin_run(uuid4(), retry=True, client_key=uuid4())
        error = caught.value
        assert error.status_code == 409
        assert error.code == expected_code
        handler = create_app().exception_handlers[ConversationError]
        response = await handler(None, error)
        assert response.status_code == 409
        assert json.loads(response.body).get('code') == expected_code
    asyncio.run(run())
