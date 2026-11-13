import asyncio
import unittest

from runs import FencedDB, RunExpired


class ConversationFenceTest(unittest.TestCase):
    def test_completion_cannot_write_to_another_conversation(self):
        class Connection:
            def transaction(self): return self
            async def __aenter__(self): return self
            async def __aexit__(self, *args): return False
            async def fetchval(self, query, *args):
                return None if 'conversation_id=$3' in query and args[2] != 'A' else 1
            async def fetchrow(self, query, *args):
                raise AssertionError('cross-conversation write must not occur')
        class Pool:
            def acquire(self): return Connection()

        async def run():
            with self.assertRaises(RunExpired):
                await FencedDB(Pool(), 'run', 'lease').complete('B', 'response')
        asyncio.run(run())
