import asyncio
import logging

import pytest

from checkpoints import CACHE_MISS
from checkpoint_tools import ToolFailure, ToolGuard, checkpointed_tool


class Store:
    def __init__(self, fail=None, cached=CACHE_MISS):
        self.fail = fail
        self.cached = cached
        self.events = []

    async def cached_tool(self, name, args):
        self.events.append('lookup')
        if self.fail == 'lookup':
            raise ValueError('private caption Bearer secret')
        return self.cached

    async def record_tool(self, name, args, result):
        self.events.append('write')
        if self.fail == 'write':
            raise ValueError('private caption Bearer secret')


@pytest.mark.parametrize('phase,cached,expected_calls', [
    ('lookup', CACHE_MISS, 0),
    ('write', CACHE_MISS, 1),
    ('execution', CACHE_MISS, 1),
    ('execution', {'old': True}, 1),
])
def test_failures_are_classified_sanitized_and_guard_stops_following_tools(
        phase, cached, expected_calls, caplog):
    async def run():
        store = Store(fail=phase, cached=cached)
        guard = ToolGuard(store)
        calls = []

        async def function(**kwargs):
            calls.append(kwargs)
            if phase == 'execution':
                raise ValueError('private caption Bearer secret')
            return {'ok': True}

        with caplog.at_level(logging.WARNING):
            with pytest.raises(ToolFailure) as caught:
                await guard(function, {'caption': 'private caption'}, function_name='brand')
            assert caught.value.phase == phase
            assert caught.value.__cause__ is None
            with pytest.raises(ToolFailure) as blocked:
                await guard(function, {}, function_name='propose_instagram_post')
            assert blocked.value.phase == phase
        assert len(calls) == expected_calls
        assert guard.failed is True
        assert 'private' not in caplog.text
        assert 'secret' not in caplog.text
        assert 'private' not in str(caught.value)
        assert phase in caplog.text

    asyncio.run(run())


def test_mutating_tool_exception_is_execution_failure_without_checkpoint_or_retry():
    async def run():
        store, calls = Store(), []

        async def proposal(**kwargs):
            calls.append(1)
            raise RuntimeError('Bearer secret')

        with pytest.raises(ToolFailure) as caught:
            await checkpointed_tool(store, proposal, {}, name='propose_instagram_post')
        assert caught.value.phase == 'execution'
        assert calls == [1]
        assert store.events == []

    asyncio.run(run())


def test_guard_passes_through_success_and_validation_errors():
    async def run():
        guard = ToolGuard(Store())

        async def proposal(**kwargs):
            return {'error': 'invalid input'}

        assert await guard(proposal, {}, function_name='propose_instagram_post') == {'error': 'invalid input'}
        assert guard.failed is False
    asyncio.run(run())


def test_invalid_read_result_stops_guard_as_execution_failure(monkeypatch):
    def invalid_result(value):
        raise ValueError('secret')

    monkeypatch.setattr('checkpoint_tools.redact_checkpoint_data', invalid_result)
    async def run():
        guard = ToolGuard(Store())

        async def malformed(**kwargs):
            return {'value': 'secret'}

        with pytest.raises(ToolFailure) as caught:
            await guard(malformed, {}, function_name='brand')
        assert caught.value.phase == 'execution'
        assert guard.failed
    asyncio.run(run())


def test_concurrent_tools_do_not_start_after_failure():
    async def run():
        guard = ToolGuard(Store())
        started = asyncio.Event()
        release = asyncio.Event()
        calls = []

        async def failing(**kwargs):
            started.set()
            await release.wait()
            raise ValueError('secret')

        async def proposal(**kwargs):
            calls.append(1)
            return {'ok': True}

        first = asyncio.create_task(guard(failing, {}, function_name='brand'))
        await started.wait()
        second = asyncio.create_task(guard(proposal, {}, function_name='propose_instagram_post'))
        await asyncio.sleep(0)
        release.set()
        results = await asyncio.gather(first, second, return_exceptions=True)
        assert all(isinstance(result, ToolFailure) for result in results)
        assert calls == []
    asyncio.run(run())


def test_cancelled_tool_blocks_following_tool_without_retry():
    async def run():
        guard = ToolGuard(Store())
        started = asyncio.Event()
        calls = []

        async def interrupted(**kwargs):
            calls.append(1)
            started.set()
            await asyncio.Event().wait()

        task = asyncio.create_task(guard(interrupted, {}, function_name='propose_instagram_post'))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        with pytest.raises(ToolFailure):
            await guard(interrupted, {}, function_name='propose_instagram_post')
        assert calls == [1]
    asyncio.run(run())
