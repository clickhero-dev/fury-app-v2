"""Transport-independent SSE encoding and detached stream lifecycle.

Closing or cancelling the consumer disconnects it, but does not cancel the
producer. The supplied task set retains producers until they finish.
"""
import asyncio
import json
from contextlib import asynccontextmanager


def encode_event(name, data, *, ensure_ascii=True):
    """Encode a named SSE event using the chat's existing JSON wire format."""
    if not isinstance(name, str) or not name or '\n' in name or '\r' in name:
        raise ValueError('invalid SSE event name')
    return 'event: ' + name + '\ndata: ' + json.dumps(data, ensure_ascii=ensure_ascii) + '\n\n'


async def heartbeat(update, *, interval=10):
    """Refresh after each interval; stop on a lost lease or refresh failure."""
    while True:
        await asyncio.sleep(interval)
        try:
            if not await update():
                return
        except Exception:
            return


@asynccontextmanager
async def heartbeat_scope(update, *, interval=10):
    """Keep the lease heartbeat alive for a producer and always join it."""
    task = asyncio.create_task(heartbeat(update, interval=interval))
    try:
        yield
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


def start_stream(tasks, producer, queue_size=64):
    """Run producer(emit) in a tracked task and return an async event iterator."""
    queue = asyncio.Queue(maxsize=queue_size)
    disconnected = asyncio.Event()
    sentinel = object()

    async def emit(event):
        if disconnected.is_set():
            return
        put = asyncio.create_task(queue.put(event))
        closed = asyncio.create_task(disconnected.wait())
        try:
            await asyncio.wait((put, closed), return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in (put, closed):
                if not task.done():
                    task.cancel()
            await asyncio.gather(put, closed, return_exceptions=True)

    async def run():
        try:
            await producer(emit)
        except asyncio.CancelledError:
            disconnected.set()
            raise
        finally:
            await emit(sentinel)

    task = asyncio.create_task(run())
    tasks.add(task)
    task.add_done_callback(tasks.discard)

    class EventStream:
        def __aiter__(self):
            return self

        async def __anext__(self):
            if disconnected.is_set():
                raise StopAsyncIteration
            get = asyncio.create_task(queue.get())
            closed = asyncio.create_task(disconnected.wait())
            try:
                await asyncio.wait((get, closed), return_when=asyncio.FIRST_COMPLETED)
                if disconnected.is_set():
                    raise StopAsyncIteration
                event = get.result()
                if event is sentinel:
                    disconnected.set()
                    raise StopAsyncIteration
                return event
            except asyncio.CancelledError:
                disconnected.set()
                raise
            finally:
                for pending in (get, closed):
                    if not pending.done():
                        pending.cancel()
                await asyncio.gather(get, closed, return_exceptions=True)

        async def aclose(self):
            disconnected.set()

    return EventStream()
