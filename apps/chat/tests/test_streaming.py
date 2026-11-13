"""Funcionalidade: resposta continua após perda da conexão
Cenário: cliente desconecta durante geração
Dado uma geração em execução
Quando o cliente interrompe a leitura do streaming
Então o processamento continua até terminar
"""
import asyncio
from streaming import start_stream

def test_producer_continues_after_disconnect():
    async def run():
        done = asyncio.Event()
        tasks = set()
        async def produce(emit):
            await emit('first')
            await asyncio.sleep(0.01)
            done.set()
        events = start_stream(tasks, produce)
        assert await anext(events) == 'first'
        await events.aclose()
        await asyncio.wait_for(done.wait(), timeout=1)
    asyncio.run(run())

# Cenário: aprovação aceita ainda sem envio é recuperável
# Dado uma aprovação de vídeo em estado approved
# Quando o usuário abre novamente a conversa
# Então o job usa identificador da aprovação para retomar

def test_approved_job_is_recoverable():
    from streaming import recoverable_job_id
    import uuid
    approval = str(uuid.uuid4())
    assert recoverable_job_id('/api/studio/video/jobs','approved',approval,None) == approval

# Cenário: redespacho usa aprovação original e corpo imutável
# Dado um job aprovado ainda não enviado
# Quando o usuário reconecta
# Então envia os mesmos parâmetros com a identidade delegada

def test_resume_approved_video():
    import httpx
    from streaming import resume_approved_video
    async def run():
        async def handler(request):
            assert request.headers['x-chat-approval-id'] == 'approval-id'
            assert request.headers['authorization'] == 'Bearer delegated'
            assert request.content == b'{"prompt":"cafe"}'
            return httpx.Response(202, json={'jobId':'approval-id'})
        class DB:
            async def execute(self, query, *args):
                assert 'jobId' in args[0]
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await resume_approved_video(client, DB(), 'https://ady.test', 'delegated', 'approval-id', 'tenant', 'user', '/api/studio/video/jobs', {'prompt':'cafe'})
    asyncio.run(run())

# Cenário: cliente lento aplica backpressure e desconexão libera produtor
# Dado streaming com fila cheia
# Quando o cliente desconecta sem ler mais
# Então o produtor termina sem bloquear

def test_backpressure_released_by_disconnect():
    async def run():
        from streaming import start_stream
        reached = asyncio.Event()
        completed = asyncio.Event()
        tasks = set()
        async def produce(emit):
            await emit('one')
            await emit('two')
            reached.set()
            for i in range(100): await emit(str(i))
            completed.set()
        events = start_stream(tasks, produce, queue_size=1)
        assert await anext(events) == 'one'
        await asyncio.wait_for(reached.wait(), 1)
        await asyncio.sleep(0.02)
        assert not completed.is_set()
        await events.aclose()
        await asyncio.wait_for(completed.wait(), 1)
    asyncio.run(run())

# Cenário: erro definitivo no redespacho encerra a aprovação
# Dado um job aprovado e ainda não enviado
# Quando a API rejeita dados com status 400
# Então a aprovação é marcada como falha

def test_resume_rejected_job_marks_failed():
    import httpx
    from streaming import resume_approved_video
    async def run():
        async def handler(request): return httpx.Response(400)
        class DB:
            def __init__(self): self.calls=[]
            async def execute(self, query, *args): self.calls.append(query)
        db = DB()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await resume_approved_video(client, db, 'https://ady.test', 'delegated', 'approval-id', 'tenant', 'user', '/api/studio/video/jobs', {'prompt':'cafe'})
        assert len(db.calls) == 1 and "status='failed'" in db.calls[0]
    asyncio.run(run())

# Cenário: cliente desconecta antes de consumir o primeiro evento
# Dado produtor assíncrono com fila limitada
# Quando a transmissão é fechada antes da primeira leitura
# Então o produtor continua sem bloquear na fila

def test_disconnect_before_first_read_releases_producer():
    async def run():
        done = asyncio.Event()
        async def producer(emit):
            for i in range(100): await emit(str(i))
            done.set()
        events = start_stream(set(), producer, queue_size=1)
        await events.aclose()
        await asyncio.wait_for(done.wait(), 1)
    asyncio.run(run())

# Cenário: fechamento libera leitor que espera evento
# Dado cliente aguardando o próximo evento sem dados disponíveis
# Quando a transmissão é fechada
# Então o leitor termina sem aguardar o produtor

def test_close_releases_waiting_reader():
    async def run():
        gate = asyncio.Event()
        async def producer(emit):
            await gate.wait()
        tasks = set()
        events = start_stream(tasks, producer)
        reader = asyncio.create_task(anext(events))
        await asyncio.sleep(0)
        await events.aclose()
        try:
            with pytest.raises(StopAsyncIteration):
                await asyncio.wait_for(reader, timeout=0.2)
        finally:
            gate.set()
            await asyncio.gather(*tasks)
    import pytest
    asyncio.run(run())

# Cenário: job pode ser identificado mesmo se resultado ficou indeterminado
# Dado aprovação de vídeo com status desconhecido
# Quando consulta o estado
# Então procura job pelo ID original sem reenviar

def test_unknown_video_job_can_be_rechecked():
    import uuid
    from streaming import recoverable_job_id
    approval = str(uuid.uuid4())
    assert recoverable_job_id('/api/studio/video/jobs','unknown',approval,{'error':'indeterminado'}) == approval

# Cenário: job antigo que ainda não iniciou fica indeterminado
# Dado job pendente há mais de cinco minutos
# Quando consulta seu andamento
# Então o estado orienta verificação sem reenfileirar

def test_old_pending_video_job_is_uncertain():
    from datetime import datetime, timezone, timedelta
    from streaming import safe_video_job
    now = datetime.now(timezone.utc)
    job = {'jobId':'id','status':'pending','stage':'queued','createdAt':(now-timedelta(minutes=6)).isoformat()}
    result = safe_video_job(job, now=now)
    assert result['status'] == 'unknown'
    assert 'verifique' in result['error'].lower()
    assert safe_video_job({**job,'status':'running'},now=now)['status'] == 'running'

# Cenário: worker não confirmou resultado do vídeo
# Dado job com falha de resultado incerto
# Quando consulta estado
# Então informa verificação antes de nova tentativa

def test_video_uncertain_error_remains_uncertain():
    from streaming import safe_video_job
    job = {'jobId':'id','status':'error','error':'Não foi possível confirmar o resultado do vídeo. Verifique antes de tentar novamente.'}
    result = safe_video_job(job)
    assert result['status'] == 'error'
    assert 'verifique antes de tentar' in result['error'].lower()
