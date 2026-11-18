"""Explicit checkpoint double for tests that already replace persistence.

Not autouse: PostgreSQL/runtime tests exercise the real checkpoint repository.
"""
import pytest


@pytest.fixture
def guided_setup_unavailable(monkeypatch):
    import app as chat
    from guided_setup import SetupState
    from guided_setup_persistence import SnapshotMissing

    class Setup:
        def __init__(self, *args): pass
        async def capture_snapshot(self): raise SnapshotMissing()
        async def current(self): return SetupState()

    monkeypatch.setattr(chat, 'GuidedSetupPersistence', Setup)


@pytest.fixture
def checkpoint_store(monkeypatch, guided_setup_unavailable):
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
