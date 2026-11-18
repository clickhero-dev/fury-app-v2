"""Explicit checkpoint double for tests that already replace persistence.

Not autouse: PostgreSQL/runtime tests exercise the real checkpoint repository.
"""
import pytest


@pytest.fixture
def checkpoint_store(monkeypatch):
    import app as chat
    from checkpoints import CACHE_MISS

    class Checkpoints:
        def __init__(self, *args, **kwargs):
            self.snapshot = None

        async def load_context(self):
            return self.snapshot

        async def save_context(self, context, history):
            self.snapshot = (context, history)

        async def cached_tool(self, *args):
            return CACHE_MISS

        async def record_tool(self, *args):
            pass

    monkeypatch.setattr(chat, 'CheckpointRepository', Checkpoints)
