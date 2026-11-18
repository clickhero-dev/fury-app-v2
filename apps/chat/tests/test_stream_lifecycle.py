import asyncio
import json

import pytest

from stream_lifecycle import encode_event, heartbeat, heartbeat_scope, start_stream


def test_encode_event_matches_existing_wire_format_and_escapes_data():
    assert encode_event('token', {'content': 'olá\nworld'}) == 'event: token\ndata: ' + json.dumps({'content': 'olá\nworld'}) + '\n\n'
    with pytest.raises(ValueError):
        encode_event('bad\nevent', {})
    with pytest.raises(TypeError):
        encode_event('token', object())


def test_heartbeat_waits_then_stops_on_false_or_exception():
    async def run():
        for failure in (False, RuntimeError('lost')):
            calls = []
            async def update():
                calls.append(1)
                if isinstance(failure, Exception):
                    raise failure
                return failure
            task = asyncio.create_task(heartbeat(update, interval=0.001))
            assert calls == []
            await asyncio.wait_for(task, 1)
            assert calls == [1]
    asyncio.run(run())


def test_heartbeat_repeats_and_is_cancellable():
    async def run():
        called = asyncio.Event()
        count = 0
        async def update():
            nonlocal count
            count += 1
            if count == 2:
                called.set()
            return True
        task = asyncio.create_task(heartbeat(update, interval=0.001))
        await asyncio.wait_for(called.wait(), 1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    asyncio.run(run())


def test_heartbeat_scope_cleans_up_even_on_error():
    async def run():
        started = asyncio.Event()
        cancelled = asyncio.Event()
        async def update():
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        with pytest.raises(RuntimeError, match='producer failed'):
            async with heartbeat_scope(update, interval=0):
                await asyncio.wait_for(started.wait(), 1)
                raise RuntimeError('producer failed')
        assert cancelled.is_set()
    asyncio.run(run())


def test_stream_disconnect_releases_backpressure_but_not_producer():
    async def run():
        tasks = set()
        done = asyncio.Event()
        async def producer(emit):
            for i in range(10):
                await emit(str(i))
            done.set()
        stream = start_stream(tasks, producer, queue_size=1)
        assert await anext(stream) == '0'
        await stream.aclose()
        await asyncio.wait_for(done.wait(), 1)
        await asyncio.gather(*tasks)
        await asyncio.sleep(0)
        assert not tasks
    asyncio.run(run())


def test_stream_completion_and_waiting_reader_close():
    async def run():
        async def producer(emit):
            await emit('event')
        tasks = set()
        stream = start_stream(tasks, producer)
        assert [event async for event in stream] == ['event']
        await asyncio.gather(*tasks)
        gate = asyncio.Event()
        async def blocked(emit):
            await gate.wait()
        stream = start_stream(tasks, blocked)
        reader = asyncio.create_task(anext(stream))
        await asyncio.sleep(0)
        await stream.aclose()
        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(reader, 1)
        gate.set()
        await asyncio.gather(*tasks)
    asyncio.run(run())


def test_cancelled_reader_disconnects_without_cancelling_producer():
    async def run():
        gate = asyncio.Event()
        tasks = set()
        async def producer(emit):
            await gate.wait()
            await emit('ignored')
        stream = start_stream(tasks, producer)
        reader = asyncio.create_task(anext(stream))
        await asyncio.sleep(0)
        reader.cancel()
        with pytest.raises(asyncio.CancelledError):
            await reader
        assert tasks and not next(iter(tasks)).cancelled()
        gate.set()
        await asyncio.gather(*tasks)
    asyncio.run(run())
