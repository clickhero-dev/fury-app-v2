"""Funcionalidade: não pedir confirmação de vídeo indisponível
Cenário: plano não habilita criação
Dado uma consulta delegada com enabled false
Quando o assistente propõe um vídeo
Então retorna motivo seguro sem criar aprovação nem iniciar geração
"""
import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import httpx
import pytest

from tools import AdyTools, ImageProposal

NOT_IN_PLAN = 'A criação de vídeos não está disponível no seu plano atual.'
UNAVAILABLE = 'Não foi possível verificar a disponibilidade de vídeos. Nenhuma proposta foi criada.'


class ProposalDB:
    def __init__(self):
        self.writes = []

    async def fetchrow(self, query, *args):
        self.writes.append((query, args))
        return {'id': uuid4(), 'expires_at': datetime.now(timezone.utc)}


def test_disabled_video_does_not_create_an_approval():
    async def run():
        db, requests, emitted = ProposalDB(), [], []
        async def emit(approval):
            emitted.append(approval)
        def handler(request):
            requests.append(request)
            assert request.method == 'GET'
            assert request.url.path == '/api/studio/video/options'
            assert request.headers['authorization'] == 'Bearer delegated'
            assert request.extensions['timeout']['read'] == 10
            return httpx.Response(200, json={'enabled': False, 'videosRemaining': 0})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            proposal = ImageProposal(db, 'tenant', 'user', 'conversation', emit, AdyTools('https://ady.invalid', 'delegated', client))
            result = await proposal.propose_video('Vídeo sobre café gelado', 'Café gelado no copo')
        assert result == {'code': 'VIDEO_NOT_IN_PLAN', 'error': NOT_IN_PLAN}
        assert len(requests) == 1
        assert db.writes == []
        assert emitted == []
    asyncio.run(run())


# Cenário: cota de criação acabou, então não propõe uma operação impossível.
# Dado remaining zero, quando solicita vídeo, então não grava nem emite aprovação.
def test_creation_quota_is_checked_before_persisting():
    async def run():
        db = ProposalDB()
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={'enabled': True, 'videosRemaining': 0}))) as client:
            proposal = ImageProposal(db, 't', 'u', 'c', ady=AdyTools('https://ady.invalid', 'delegated', client))
            assert await proposal.propose_video('Vídeo sobre café gelado', 'Café gelado no copo') == {
                'code': 'VIDEO_QUOTA_EXCEEDED', 'error': 'O limite de criação de vídeos deste período foi atingido.'}
        assert db.writes == []
    asyncio.run(run())


# Cenário: edição também exige disponibilidade antes de criar aprovação.
# Dado plano sem vídeo, quando solicita ajuste, então não grava aprovação nem POST.
def test_edit_video_checks_availability_before_proposing():
    async def run():
        db, requests, asset = ProposalDB(), [], str(uuid4())
        def handler(request):
            requests.append(request)
            assert request.method == 'GET'
            if request.url.path == '/api/studio/video/options':
                return httpx.Response(200, json={'enabled': False, 'videosRemaining': 0})
            return httpx.Response(200, json={'data': {'id': asset, 'type': 'video', 'version': '9'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            proposal = ImageProposal(db, 't', 'u', 'c', ady=AdyTools('https://ady.invalid', 'delegated', client))
            assert await proposal.propose_edit_video(asset, 'Mudar o ritmo') == {'code': 'VIDEO_NOT_IN_PLAN', 'error': NOT_IN_PLAN}
        assert db.writes == []
        assert [r.url.path for r in requests] == ['/api/studio/video/options']
    asyncio.run(run())


# Cenário: resposta ausente ou malformada não permite confirmar disponibilidade.
# Dado payload sem campos confiáveis, quando propõe criação ou edição, então não grava.
@pytest.mark.parametrize('options', [None, [], {}, {'enabled': True}, {'videosRemaining': 2},
    {'enabled': 'true', 'videosRemaining': 2}, {'enabled': 1, 'videosRemaining': 2},
    {'enabled': True, 'videosRemaining': False}, {'enabled': True, 'videosRemaining': -1},
    {'enabled': True, 'videosRemaining': '2'}, {'enabled': True, 'videosRemaining': 1.5}])
@pytest.mark.parametrize('editing', [False, True])
def test_invalid_options_fail_closed(options, editing):
    async def run():
        db = ProposalDB()
        def handler(request):
            assert request.method == 'GET'
            if request.url.path == '/api/studio/video/options':
                return httpx.Response(200, json=options)
            return httpx.Response(200, json={'data': {'type': 'video', 'version': '9'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            proposal = ImageProposal(db, 't', 'u', 'c', ady=AdyTools('https://ady.invalid', 'delegated', client))
            result = await proposal.propose_edit_video(str(uuid4()), 'Mudar o ritmo') if editing else await proposal.propose_video('Vídeo sobre café gelado', 'Café no copo')
        assert result == {'error': UNAVAILABLE}
        assert db.writes == []
    asyncio.run(run())


# Cenário: serviço indisponível não gera promessa de criação ou edição.
# Dado falha HTTP/timeout, quando propõe, então retorna cópia fixa sem efeitos.
@pytest.mark.parametrize('status', [400, 401, 403, 404, 502, 503, 'timeout', 'invalid_json'])
@pytest.mark.parametrize('editing', [False, True])
def test_unavailable_options_cannot_create_approvals(status, editing):
    async def run():
        db, calls = ProposalDB(), []
        def handler(request):
            calls.append(request)
            assert request.method == 'GET'
            if request.url.path != '/api/studio/video/options':
                return httpx.Response(200, json={'data': {'type': 'video', 'version': '9'}})
            if status == 'timeout':
                raise httpx.ReadTimeout('private provider', request=request)
            if status == 'invalid_json':
                return httpx.Response(200, text='private provider')
            return httpx.Response(status, json={'error': {'code': 'SERVICE_BLOCKED', 'message': 'private provider'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            proposal = ImageProposal(db, 't', 'u', 'c', ady=AdyTools('https://ady.invalid', 'delegated', client))
            result = await proposal.propose_edit_video(str(uuid4()), 'Mudar o ritmo') if editing else await proposal.propose_video('Vídeo sobre café gelado', 'Café no copo')
        assert result == {'error': UNAVAILABLE}
        assert db.writes == []
        assert len(calls) == 1
    asyncio.run(run())


# Cenário: aprovação válida continua explícita, inclusive quota ilimitada null.
# Dado opções válidas, quando propõe, então grava uma proposta e nunca envia POST.
@pytest.mark.parametrize('remaining', [1, None])
@pytest.mark.parametrize('editing', [False, True])
def test_available_options_only_create_a_pending_proposal(remaining, editing):
    async def run():
        db, calls, emitted, asset = ProposalDB(), [], [], str(uuid4())
        async def emit(value):
            emitted.append(value)
        def handler(request):
            calls.append(request)
            assert request.method == 'GET'
            if request.url.path == '/api/studio/video/options':
                return httpx.Response(200, json={'enabled': True, 'videosRemaining': remaining, 'providerSecret': 'private'})
            assert request.url.path == f'/api/studio/ai/assets/{asset}/chat-snapshot'
            return httpx.Response(200, json={'data': {'id': asset, 'type': 'video', 'version': '9'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            proposal = ImageProposal(db, 't', 'u', 'c', emit, AdyTools('https://ady.invalid', 'delegated', client))
            result = await proposal.propose_edit_video(asset, 'Mudar o ritmo') if editing else await proposal.propose_video('Vídeo sobre café gelado', 'Café no copo')
        assert result['status'] == 'pending'
        assert 'private' not in str(result)
        assert len(db.writes) == len(emitted) == 1
        assert len(calls) == (2 if editing else 1)
    asyncio.run(run())


# Cenário: editar não consome a cota mensal de criação, como na API autoritativa.
# Dado cota mensal zero e vídeo habilitado, quando edita, então pode propor ajuste.
def test_monthly_creation_quota_is_not_misapplied_to_editing():
    async def run():
        db, asset = ProposalDB(), str(uuid4())
        def handler(request):
            if request.url.path == '/api/studio/video/options':
                return httpx.Response(200, json={'enabled': True, 'videosRemaining': 0})
            return httpx.Response(200, json={'data': {'id': asset, 'type': 'video', 'version': '9'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            proposal = ImageProposal(db, 't', 'u', 'c', ady=AdyTools('https://ady.invalid', 'delegated', client))
            assert (await proposal.propose_edit_video(asset, 'Mudar o ritmo'))['status'] == 'pending'
        assert len(db.writes) == 1
    asyncio.run(run())


# Cenário: indisponibilidade não bloqueia consulta de job previamente existente.
# Dado job iniciado, quando consulta progresso, então não consulta options nem gera vídeo.
def test_existing_job_read_is_not_gated_by_options():
    async def run():
        job, calls = str(uuid4()), []
        def handler(request):
            calls.append(request)
            assert request.method == 'GET'
            assert request.url.path == '/api/studio/video/jobs/' + job
            return httpx.Response(200, json={'jobId': job, 'status': 'running'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert (await AdyTools('https://ady.invalid', 'delegated', client).video_job(job))['status'] == 'running'
        assert len(calls) == 1
    asyncio.run(run())


# Cenário: defaults de cliente e redirects não vazam credenciais de preflight.
# Dado cliente compartilhado com dados alheios, quando consulta options, então usa somente escopo explícito.
@pytest.mark.parametrize('redirect', [False, True])
def test_options_transport_has_explicit_scope_and_timeout(redirect):
    async def run():
        calls = []
        def handler(request):
            calls.append(request)
            assert str(request.url) == 'https://ady.invalid/api/studio/video/options'
            assert request.headers['authorization'] == 'Bearer delegated'
            assert 'cookie' not in request.headers and 'x-private' not in request.headers
            assert request.extensions['timeout'] == httpx.Timeout(10.0).as_dict()
            if redirect:
                return httpx.Response(302, headers={'location': 'https://external.invalid/steal'})
            return httpx.Response(200, json={'enabled': True, 'videosRemaining': None, 'secret': 'private'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True,
            auth=('other', 'private'), cookies={'session': 'private'}, params={'token': 'private'}, headers={'X-Private': 'private'}) as client:
            result = await AdyTools('https://ady.invalid/', 'delegated', client).video_options()
        assert result == ({'error': UNAVAILABLE} if redirect else {'enabled': True, 'videosRemaining': None})
        assert len(calls) == 1
    asyncio.run(run())
