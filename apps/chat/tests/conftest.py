"""Explicit checkpoint double for tests that already replace persistence.

Not autouse: PostgreSQL/runtime tests exercise the real checkpoint repository.
"""
import pytest


@pytest.fixture(autouse=True)
def synthetic_credentials_for_stubbed_agents(request, monkeypatch):
    """Runtime fixtures replacing Agno's Agent need a non-secret provider selection."""
    stubbed_agent_files = {
        'test_attachment_service.py', 'test_checkpoint_runtime.py',
        'test_turn_cross_service.py', 'test_response_clarity.py',
        'test_chat_read_registration.py', 'test_run_concurrency.py',
        'test_empty_model_response.py', 'test_conversations_postgres.py',
        'test_response_messages_postgres.py', 'test_response_stream_boundaries.py',
        'test_clarification_fence_contract.py',
    }
    if request.path.name in stubbed_agent_files:
        monkeypatch.setenv('OPENAI_API_KEY', 'synthetic-only')
        monkeypatch.setenv('ANTHROPIC_API_KEY', '')
        monkeypatch.setenv('OPENROUTER_API_KEY', '')


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
