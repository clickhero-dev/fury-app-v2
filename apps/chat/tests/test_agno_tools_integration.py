"""Funcionalidade: Agno propõe ações sem executá-las
Cenário: modelo solicita criação de imagem
Dado uma ferramenta registrada no agente
Quando o provedor devolve uma chamada de ferramenta
Então uma proposta pendente é criada e nenhuma imagem é gerada
"""
import asyncio
import json
import uuid
from datetime import datetime, timezone
import httpx
from agno.agent import Agent
from agno.models.openrouter import OpenRouter
from tools import ImageProposal, AdyTools
import pytest

def test_agno_executes_bound_proposal_tool():
    async def run():
        requests = []
        proposals = []
        async def handler(request):
            payload = json.loads(request.content)
            requests.append(payload)
            if len(requests) == 1:
                message = {'role':'assistant','content':None,'tool_calls':[{'id':'call-1','type':'function','function':{'name':'propose_image','arguments':json.dumps({'prompt':'Um café em uma mesa iluminada','model':'google/gemini-3.1-flash-image','aspect_ratio':'1:1'})}}]}
                finish = 'tool_calls'
            else:
                message = {'role':'assistant','content':'Preparei a proposta para você confirmar.'}
                finish = 'stop'
            return httpx.Response(200, json={'id':'test','object':'chat.completion','created':1,'model':'test','choices':[{'index':0,'message':message,'finish_reason':finish}],'usage':{'prompt_tokens':1,'completion_tokens':1,'total_tokens':2}})
        class DB:
            async def fetchrow(self, query, *args):
                proposals.append((query,args))
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            proposal = ImageProposal(DB(), 'tenant', 'user', 'conversation')
            model = OpenRouter(id='deepseek/deepseek-v4-pro-0813', api_key='test', http_client=client)
            result = await Agent(model=model,tools=[proposal.propose_image]).arun('Crie uma imagem')
            assert result.content
        assert len(requests) == 2
        assert len(proposals) == 1
        assert '/api/studio/ai/generate-image' in proposals[0][0]
    asyncio.run(run())

# Cenário: ferramenta funciona com streaming do provedor
# Dado chamada de ferramenta dividida em eventos SSE
# Quando o agente recebe a chamada
# Então cria proposta e transmite resposta sem executar ação

def test_agno_streams_bound_proposal_tool():
    async def run():
        calls = []
        proposals = []
        def chunk(delta, reason=None):
            return 'data: '+json.dumps({'id':'test','object':'chat.completion.chunk','created':1,'model':'test','choices':[{'index':0,'delta':delta,'finish_reason':reason}]})+'\n\n'
        async def handler(request):
            calls.append(json.loads(request.content))
            if len(calls) == 1:
                fragments = chunk({'role':'assistant','tool_calls':[{'index':0,'id':'call-1','type':'function','function':{'name':'propose_image','arguments':json.dumps({'prompt':'Um café em uma mesa iluminada','model':'google/gemini-3.1-flash-image'})}}]}) + chunk({},'tool_calls')
            else:
                fragments = chunk({'role':'assistant','content':'Proposta pronta.'}) + chunk({},'stop')
            return httpx.Response(200, headers={'content-type':'text/event-stream'}, content=fragments+'data: [DONE]\n\n')
        class DB:
            async def fetchrow(self, query, *args):
                proposals.append((query,args))
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            proposal = ImageProposal(DB(),'tenant','user','conversation')
            agent = Agent(model=OpenRouter(id='deepseek/deepseek-v4-pro-0813',api_key='test',http_client=client),tools=[proposal.propose_image])
            events = []
            async for event in agent.arun('Crie uma imagem',stream=True):
                if isinstance(event.content,str): events.append(event.content)
            assert 'Proposta pronta.' in ''.join(events)
        assert len(calls) == 2
        assert len(proposals) == 1
    asyncio.run(run())

# Cenário: referência de imagem está disponível no schema do Agno
# Dado ferramenta de proposta de imagem
# Quando o Agno serializa sua assinatura
# Então expõe photo_ids como lista opcional

def test_agno_image_tool_exposes_photo_ids():
    from agno.tools import Function
    schema = Function.from_callable(ImageProposal(None,None,None,None).propose_image).to_dict()
    prop = schema['parameters']['properties']['photo_ids']
    assert {'type':'array','items':{'type':'string'}} in prop['anyOf']
    assert 'photo_ids' not in schema['parameters']['required']


# Cenário: modelo solicita vídeo indisponível e recebe apenas uma recusa segura.
# Dado criação/edição registrada no Agno, quando modelo chama a ferramenta,
# então options é consultado e nenhuma aprovação ou geração é criada.
@pytest.mark.parametrize('editing', [False, True])
def test_agno_video_tool_observes_preflight_refusal(editing):
    async def run():
        model_calls, api_calls, proposals = [], [], []
        name = 'propose_edit_video' if editing else 'propose_video'
        arguments = {'asset_id': str(uuid.uuid4()), 'feedback': 'Mudar o ritmo'} if editing else {'prompt': 'Vídeo sobre café gelado', 'visual': 'Café no copo'}
        async def model_handler(request):
            payload = json.loads(request.content)
            model_calls.append(payload)
            assert 'delegated-private' not in request.content.decode()
            assert [tool['function']['name'] for tool in payload['tools']] == [name]
            if len(model_calls) == 1:
                message = {'role': 'assistant', 'content': None, 'tool_calls': [{'id': 'call-video', 'type': 'function', 'function': {'name': name, 'arguments': json.dumps(arguments)}}]}
                reason = 'tool_calls'
            else:
                evidence = next(item['content'] for item in reversed(payload['messages']) if item['role'] == 'tool')
                assert 'VIDEO_NOT_IN_PLAN' in evidence
                assert 'A criação de vídeos não está disponível no seu plano atual.' in evidence
                assert 'secret' not in evidence
                message = {'role': 'assistant', 'content': 'A criação de vídeos não está disponível no seu plano atual.'}
                reason = 'stop'
            return httpx.Response(200, json={'id': 'test', 'object': 'chat.completion', 'created': 1, 'model': 'test',
                'choices': [{'index': 0, 'message': message, 'finish_reason': reason}], 'usage': {'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2}})
        async def api_handler(request):
            api_calls.append(request)
            assert request.method == 'GET'
            assert request.url.path == '/api/studio/video/options'
            assert request.headers['authorization'] == 'Bearer delegated-private'
            return httpx.Response(200, json={'enabled': False, 'videosRemaining': 0, 'provider': 'secret'})
        class DB:
            async def fetchrow(self, *args):
                proposals.append(args)
                raise AssertionError('Preflight must prevent approval insertion')
        async with httpx.AsyncClient(transport=httpx.MockTransport(model_handler)) as model_client, httpx.AsyncClient(transport=httpx.MockTransport(api_handler)) as api_client:
            proposal = ImageProposal(DB(), 't', 'u', 'c', ady=AdyTools('https://ady.invalid', 'delegated-private', api_client))
            agent = Agent(model=OpenRouter(id='test', api_key='test', http_client=model_client, max_retries=0), tools=[getattr(proposal, name)], telemetry=False)
            result = await agent.arun('Ajuste o vídeo' if editing else 'Crie um vídeo')
            assert result.content == 'A criação de vídeos não está disponível no seu plano atual.'
        assert len(model_calls) == 2
        assert len(api_calls) == 1
        assert proposals == []
    asyncio.run(run())
