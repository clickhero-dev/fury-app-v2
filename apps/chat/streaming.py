"""Separa a execução da geração da conexão que consome seus eventos."""
import asyncio


def start_stream(tasks, producer, queue_size=64):
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
                if not task.done(): task.cancel()
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
                for task in (get, closed):
                    if not task.done(): task.cancel()
                await asyncio.gather(get, closed, return_exceptions=True)

        async def aclose(self):
            disconnected.set()

    return EventStream()



def recoverable_job_id(path: str, status: str, approval_id: str, result: dict | None) -> str | None:
    if not (path.endswith('/chat-adjust') or path == '/api/studio/video/jobs'):
        return None
    if result and result.get('jobId'):
        return str(result['jobId'])
    if status in ('approved', 'executing', 'completed', 'unknown'):
        return approval_id
    return None


async def resume_approved_video(client, db, base_url, token, approval_id, tenant_id, user_id, path, body):
    """Redespacha uma aprovação já confirmada; API consome a aprovação uma única vez."""
    import json
    import re
    import httpx
    if path != '/api/studio/video/jobs' and not re.fullmatch(r'/api/studio/video/assets/[0-9a-f-]{36}/chat-adjust', path):
        return
    try:
        response = await client.post(base_url.rstrip('/') + path, json=body, headers={'Authorization':'Bearer '+token, 'X-Chat-Approval-Id':str(approval_id)}, timeout=120)
        if response.status_code == 202:
            result = response.json()
            await db.execute('UPDATE chat_approvals SET result=$1::jsonb WHERE id=$2 AND tenant_id=$3 AND user_id=$4', json.dumps(result), approval_id, tenant_id, user_id)
        elif 400 <= response.status_code < 500 and response.status_code != 403:
            await db.execute("UPDATE chat_approvals SET status='failed' WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND status='approved'", approval_id, tenant_id, user_id)
    except (httpx.HTTPError, ValueError):
        pass


def safe_video_job(job, now=None):
    from datetime import datetime, timedelta, timezone
    result = {key:job.get(key) for key in ('jobId','status','stage','assetId','videoUrl')}
    if job.get('status') == 'error':
        uncertain = 'Não foi possível confirmar o resultado do vídeo. Verifique antes de tentar novamente.'
        result['error'] = uncertain if job.get('error') == uncertain else 'Não foi possível gerar o vídeo.'
    if job.get('status') == 'pending' and isinstance(job.get('createdAt'), str):
        try:
            created = datetime.fromisoformat(job['createdAt'].replace('Z', '+00:00'))
            if created.tzinfo and (now or datetime.now(timezone.utc)) - created > timedelta(minutes=5):
                result['status'] = 'unknown'
                result['error'] = 'O vídeo ainda não iniciou. Verifique o andamento antes de tentar novamente.'
        except ValueError:
            pass
    return result
