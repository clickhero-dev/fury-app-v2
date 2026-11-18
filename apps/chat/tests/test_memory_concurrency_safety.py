import asyncio

from memory import consolidate


def test_consolidation_preserves_unanswered_message_before_completed_response():
    rows = [
        {'id': 'first', 'role': 'user', 'content': 'First question'},
        {'id': 'second', 'role': 'user', 'content': 'Second question'},
        {'id': 'answer', 'role': 'assistant', 'content': 'First answer'},
    ]
    class Connection:
        async def fetchval(self, *_args): return None
        async def fetch(self, *_args): return rows.copy()
        async def execute(self, *_args): raise AssertionError('must not prune ambiguous turns')
        def transaction(self): return self
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): pass
    conn = Connection()
    class Pool:
        def acquire(self): return conn
    async def summarize(*_args):
        raise AssertionError('must not summarize ambiguous turns')
    assert asyncio.run(consolidate(Pool(), 'conversation', summarize, min_responses=1)) is False
