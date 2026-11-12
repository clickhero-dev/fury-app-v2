"""Funcionalidade: consulta de recursos do Ady
Cenário: consultar campanhas com credencial delegada
Dado o cliente de ferramentas autenticado
Quando consulta campanhas
Então a API recebe apenas o token delegado
Cenário: falha da API não expõe dados sensíveis
Dado uma falha no serviço principal
Quando consulta campanhas
Então o erro é sanitizado
"""
import asyncio
import httpx
from tools import AdyTools

def test_campaigns_request():
    async def run():
        async def handler(request):
            assert request.url.path == '/api/campaigns'
            assert request.headers['authorization'] == 'Bearer delegated'
            return httpx.Response(200, json={'data': []})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert await AdyTools('https://ady.test', 'delegated', client).campaigns() == {'data': []}
    asyncio.run(run())

def test_error_sanitized():
    async def run():
        async def handler(request): return httpx.Response(500, text='secret stack')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert await AdyTools('https://ady.test', 'delegated', client).campaigns() == {'error': 'Não foi possível consultar o Ady.'}
    asyncio.run(run())

# Cenário: proposta de imagem inválida não cria aprovação
# Dado um prompt curto
# Quando o assistente propõe geração
# Então nenhum registro é criado

def test_invalid_image_proposal_does_not_write():
    from tools import ImageProposal
    async def run():
        class DB:
            async def fetchrow(self, *args):
                raise AssertionError('não deve persistir')
        result = await ImageProposal(DB(), 'tenant', 'user', 'conversation').propose_image('curto', 'invalid')
        assert 'error' in result
    asyncio.run(run())

# Cenário: vídeo inválido não vira proposta
# Dado duração fora dos limites
# Quando propõe vídeo
# Então nenhuma aprovação é criada

def test_invalid_video_proposal():
    from tools import ImageProposal
    async def run():
        class DB:
            async def fetchrow(self, *args): raise AssertionError('não deve persistir')
        p = ImageProposal(DB(), 'tenant', 'user', 'conversation')
        assert 'error' in await p.propose_video('vídeo para minha empresa', 'imagens do produto', aspect_ratio='1:1')
    asyncio.run(run())

# Cenário: agendamento no passado é rejeitado
# Dado data anterior ao presente
# Quando propõe postagem
# Então nenhuma aprovação é criada

def test_past_post_rejected():
    from tools import ImageProposal
    async def run():
        class DB:
            async def fetchrow(self, *args): raise AssertionError('não deve persistir')
        p = ImageProposal(DB(), 'tenant', 'user', 'conversation')
        assert 'error' in await p.propose_instagram_post('Legenda', 'image', '2000-01-01T10:00:00Z')
    asyncio.run(run())

# Cenário: consultar calendário com período válido
# Dado um período informado
# Quando consulta o calendário
# Então envia datas e credencial delegada

def test_calendar_request():
    async def run():
        async def handler(request):
            assert request.url.path == '/api/planner/calendar'
            assert request.url.params['startDate'] == '2026-12-01'
            assert request.url.params['endDate'] == '2026-12-31'
            return httpx.Response(200, json={'data': {'posts': []}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert await AdyTools('https://ady.test', 'delegated', client).calendar('2026-12-01','2026-12-31') == {'data': {'posts': []}}
    asyncio.run(run())

# Cenário: proposta de vídeo requer aprovação com parâmetros explícitos
# Dado um pedido de vídeo válido
# Quando o assistente o propõe
# Então registra os parâmetros sem executar a geração

def test_video_proposal_stores_approval():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import json
    import uuid
    async def run():
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/studio/video/jobs'
                assert json.loads(args[4])['duration'] == 15
                return {'id':uuid.uuid4(), 'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={'enabled': True, 'videosRemaining': 1}))) as client:
            result = await ImageProposal(DB(), 'tenant', 'user', 'conversation', ady=AdyTools('https://ady.test', 'delegated', client)).propose_video('Vídeo sobre café gelado', 'Café gelado no copo')
        assert result['status'] == 'pending'
        assert result['action'] == 'Criar vídeo'
    asyncio.run(run())

# Cenário: proposta de post inclui horário e destino
# Dado horário futuro e mídia HTTPS
# Quando o assistente propõe uma postagem
# Então registra parâmetros explícitos para confirmação

def test_post_proposal_stores_approval():
    from tools import ImageProposal
    from datetime import datetime, timezone, timedelta
    import json
    import uuid
    async def run():
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/planner/posts'
                assert json.loads(args[4])['platform'] == 'instagram'
                return {'id':uuid.uuid4(), 'expires_at':datetime.now(timezone.utc)}
        when = (datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
        result = await ImageProposal(DB(), 'tenant', 'user', 'conversation').propose_instagram_post('Novo café','image',when,'https://example.invalid/image.png')
        assert result['status'] == 'pending'
        assert result['action'] == 'Agendar postagem'
    asyncio.run(run())

# Cenário: criação de campanha rejeita orçamento inválido
# Dado orçamento inferior ao mínimo
# Quando propõe uma campanha
# Então nenhuma aprovação é criada

def test_invalid_campaign_proposal():
    from tools import ImageProposal
    async def run():
        class DB:
            async def fetchrow(self, *args): raise AssertionError('não deve persistir')
        proposal = ImageProposal(DB(), 'tenant', 'user', 'conversation')
        assert 'error' in await proposal.propose_campaign('Campanha café', 'OUTCOME_TRAFFIC', 499, '123')
    asyncio.run(run())

# Cenário: campanha válida é apresentada antes da criação
# Dado parâmetros de campanha e orçamento em centavos
# Quando propõe a criação
# Então registra aprovação sem chamar o provedor

def test_campaign_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import json, uuid
    async def run():
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/campaigns/create'
                assert json.loads(args[4])['dailyBudget'] == 500
                return {'id':uuid.uuid4(), 'expires_at':datetime.now(timezone.utc)}
        async def handler(request):
            assert request.url.path == '/api/campaigns/chat-account/act_123'
            return httpx.Response(200, json={'data':{'id':'act_123','currency':'BRL'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            proposal = ImageProposal(DB(), 'tenant', 'user', 'conversation', ady=AdyTools('https://ady.test','delegated',client))
            result = await proposal.propose_campaign('Campanha café', 'OUTCOME_TRAFFIC', 500, 'act_123')
            assert result['status'] == 'pending'
            assert result['parameters']['currency'] == 'BRL'
    asyncio.run(run())

# Cenário: campanha com objetivo não suportado não é proposta
# Dado objetivo fora do catálogo
# Quando solicita campanha
# Então recebe erro sem gravar aprovação

def test_campaign_unknown_objective():
    from tools import ImageProposal
    async def run():
        class DB:
            async def fetchrow(self, *args): raise AssertionError('não deve persistir')
        result = await ImageProposal(DB(),'t','u','c').propose_campaign('Campanha válida', 'UNKNOWN', 1000, '123')
        assert 'error' in result
    asyncio.run(run())

# Cenário: cancelamento apresenta estado observado para aprovação
# Dado um post agendado do Instagram
# Quando solicita cancelamento
# Então registra sua versão e mostra dados ao usuário

def test_cancel_post_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        pid = str(uuid.uuid4())
        async def handler(request):
            assert request.url.path == '/api/planner/posts/'+pid+'/chat-snapshot'
            return httpx.Response(200, json={'data': {'id':pid,'version':'12','caption':'Café','scheduledAt':'2030-01-01T12:00:00Z','platform':'instagram','status':'approved'}})
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/planner/posts/'+pid+'/chat-cancel'
                assert json.loads(args[4]) == {'version':'12'}
                assert json.loads(args[5])['caption'] == 'Café'
                return {'id':uuid.uuid4(), 'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            p = ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client))
            result = await p.propose_cancel_post(pid)
            assert result['parameters']['caption'] == 'Café'
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: assistente consulta dados da marca autorizada
# Dado credencial delegada
# Quando consulta informações da marca
# Então encaminha a credencial à API principal

def test_brand_read():
    async def run():
        async def handler(request):
            assert request.url.path == '/api/brand-kit'
            assert request.headers['authorization'] == 'Bearer delegated'
            return httpx.Response(200, json={'businessName':'Café'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert (await AdyTools('https://ady.test','delegated',client).brand())['businessName'] == 'Café'
    asyncio.run(run())

# Cenário: consultar ativos disponíveis para edição
# Dado um usuário autorizado
# Quando consulta a biblioteca de mídia
# Então usa somente a API e identidade delegada

def test_list_assets():
    async def run():
        async def handler(request):
            assert request.url.path == '/api/studio/assets'
            assert request.headers['authorization'] == 'Bearer delegated'
            return httpx.Response(200, json={'assets':[]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert await AdyTools('https://ady.test','delegated',client).assets() == {'assets':[]}
    asyncio.run(run())

# Cenário: falha de consulta impede proposta de cancelamento
# Dado API indisponível
# Quando solicita cancelar post
# Então nenhum pedido de aprovação é criado

def test_cancel_post_snapshot_failure():
    from tools import ImageProposal
    import uuid
    async def run():
        async def handler(request): return httpx.Response(503, text='private details')
        class DB:
            async def fetchrow(self, *args): raise AssertionError('não deve persistir')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            p = ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client))
            result = await p.propose_cancel_post(str(uuid.uuid4()))
            assert 'private details' not in str(result)
            assert 'error' in result
    asyncio.run(run())

# Cenário: atualização de marca apresenta valores antigos e novos
# Dado uma marca existente
# Quando propõe alteração de cor
# Então registra versão e dados para aprovação

def test_brand_update_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        async def handler(request):
            assert request.url.path == '/api/brand-kit/chat-snapshot'
            return httpx.Response(200, json={'data':{'id':str(uuid.uuid4()),'version':'5','primaryColor':'#ffffff','secondaryColor':'#000000','voiceTone':'casual'}})
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/brand-kit/chat-update'
                assert json.loads(args[4]) == {'version':'5','primary_color':'#112233'}
                assert json.loads(args[5])['atual']['primaryColor'] == '#ffffff'
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            proposal = ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client))
            result = await proposal.propose_brand_update(primary_color='#112233')
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: marca ainda não configurada pode ser criada com versão ausente
# Dado snapshot de marca ausente
# Quando propõe cor inicial
# Então registra versão sentinela para criação concorrente segura

def test_brand_absent_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        async def handler(request): return httpx.Response(200, json={'data':{'id':None,'version':'absent','primaryColor':None,'secondaryColor':None,'voiceTone':None}})
        class DB:
            async def fetchrow(self, query, *args):
                assert json.loads(args[4])['version'] == 'absent'
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_brand_update(primary_color='#112233')
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: edição de imagem apresenta versão aprovada
# Dado uma imagem do usuário
# Quando propõe ajuste
# Então registra a versão e feedback sem executar

def test_edit_image_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        asset = str(uuid.uuid4())
        async def handler(request):
            assert request.url.path == '/api/studio/ai/assets/'+asset+'/chat-snapshot'
            return httpx.Response(200, json={'data':{'id':asset,'type':'image','url':'https://example.invalid/x.png','version':'8'}})
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/studio/ai/chat-edit'
                assert json.loads(args[4]) == {'assetId':asset,'version':'8','feedback':'Aumentar brilho'}
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_edit_image(asset,'Aumentar brilho')
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: vídeo não usa ferramenta de edição de imagem
# Dado um ativo de vídeo
# Quando pede edição pela ferramenta de imagem
# Então nenhuma aprovação é criada

def test_edit_image_rejects_video():
    from tools import ImageProposal
    import uuid
    async def run():
        asset = str(uuid.uuid4())
        async def handler(request): return httpx.Response(200, json={'data':{'id':asset,'type':'video','version':'8'}})
        class DB:
            async def fetchrow(self, *args): raise AssertionError('não deve persistir')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_edit_image(asset,'Alterar cor')
            assert 'error' in result
    asyncio.run(run())

# Cenário: ajuste de vídeo usa versão e aguarda aprovação
# Dado vídeo compatível
# Quando solicita ajuste
# Então uma proposta exibe o vídeo e o ajuste

def test_edit_video_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        asset = str(uuid.uuid4())
        async def handler(request):
            if request.url.path == '/api/studio/video/options':
                return httpx.Response(200, json={'enabled': True, 'videosRemaining': 1})
            assert request.url.path == '/api/studio/ai/assets/'+asset+'/chat-snapshot'
            return httpx.Response(200, json={'data':{'id':asset,'type':'video','url':'https://example.invalid/x.mp4','version':'9'}})
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/studio/video/assets/'+asset+'/chat-adjust'
                assert json.loads(args[4]) == {'version':'9','feedback':'Alterar ritmo'}
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_edit_video(asset,'Alterar ritmo')
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: acompanhar job de vídeo iniciado anteriormente
# Dado identificador de job persistido
# Quando consulta o progresso
# Então retorna o estado autorizado da API

def test_video_job_status():
    async def run():
        import uuid
        job = str(uuid.uuid4())
        async def handler(request):
            assert request.url.path == '/api/studio/video/jobs/'+job
            return httpx.Response(200, json={'jobId':job, 'status':'done', 'videoUrl':'https://example.invalid/v.mp4'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await AdyTools('https://ady.test','delegated',client).video_job(job)
            assert result['status'] == 'done'
    asyncio.run(run())

# Cenário: job usa identidade da aprovação para recuperação
# Dado uma aprovação em execução sem resposta persistida
# Quando consulta a conversa depois de reconectar
# Então pode recuperar o job pela identidade da aprovação

def test_job_recovery_key():
    from streaming import recoverable_job_id
    import uuid
    approval_id = str(uuid.uuid4())
    assert recoverable_job_id('/api/studio/video/assets/'+str(uuid.uuid4())+'/chat-adjust', 'executing', approval_id, None) == approval_id
    assert recoverable_job_id('/api/studio/ai/chat-edit', 'executing', approval_id, None) is None

# Cenário: criação de vídeo retoma job por aprovação
# Dado pedido de criação em execução sem resposta
# Quando reabre a conversa
# Então procura o job pelo identificador da aprovação

def test_creation_job_recovery_key():
    from streaming import recoverable_job_id
    import uuid
    approval = str(uuid.uuid4())
    assert recoverable_job_id('/api/studio/video/jobs','executing',approval,None) == approval
    assert recoverable_job_id('/api/studio/video/jobs','failed',approval,None) is None

# Cenário: consultar anúncios de campanha do tenant
# Dado uma campanha identificada por UUID
# Quando consulta anúncios
# Então usa endpoint autorizado e retorna resultado

def test_campaign_ads():
    async def run():
        import uuid
        campaign = str(uuid.uuid4())
        async def handler(request):
            assert request.url.path == '/api/campaigns/'+campaign+'/chat-ads'
            return httpx.Response(200, json={'data':[], 'partial_failures':[]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert await AdyTools('https://ady.test','delegated',client).campaign_ads(campaign) == {'data':[], 'partial_failures':[]}
    asyncio.run(run())

# Cenário: pausa de campanha apresenta versão observada
# Dado uma campanha ativa
# Quando propõe pausa
# Então armazena versão e parâmetros para aprovação

def test_campaign_pause_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        campaign = str(uuid.uuid4())
        async def handler(request):
            assert request.url.path == '/api/campaigns/'+campaign+'/chat-snapshot'
            return httpx.Response(200, json={'data':{'id':campaign,'name':'Café','status':'ACTIVE','version':'a'*64}})
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/campaigns/'+campaign+'/chat-update'
                assert json.loads(args[4]) == {'version':'a'*64,'action':'pause'}
                assert json.loads(args[5])['atual']['name'] == 'Café'
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_campaign_update(campaign,'pause')
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: orçamento de campanha abaixo do mínimo é rejeitado
# Dado valor menor que R$5 por dia
# Quando solicita alteração
# Então não consulta Meta e não cria aprovação

def test_campaign_update_budget_invalid():
    from tools import ImageProposal
    import uuid
    async def run():
        class DB:
            async def fetchrow(self, *args): raise AssertionError('não deve persistir')
        class NoAPI:
            async def get(self,*args,**kwargs): raise AssertionError('não deve consultar')
        ady=AdyTools('https://ady.test','delegated',NoAPI())
        result=await ImageProposal(DB(),'t','u','c',ady=ady).propose_campaign_update(str(uuid.uuid4()),'budget',daily_budget_cents=499)
        assert 'error' in result
    asyncio.run(run())

# Cenário: número WhatsApp é incluído na proposta de marca
# Dado número internacional sem pontuação
# Quando propõe atualização
# Então apresenta dados e versão para confirmação

def test_brand_whatsapp_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        async def handler(request): return httpx.Response(200, json={'data':{'id':str(uuid.uuid4()),'version':'8','whatsappNumber':None}})
        class DB:
            async def fetchrow(self, query, *args):
                assert json.loads(args[4])['whatsapp_number'] == '5511999999999'
                return {'id':uuid.uuid4(), 'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_brand_update(whatsapp_number='5511999999999')
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: remoção de WhatsApp exige proposta explícita
# Dado marca com número cadastrado
# Quando pede remoção
# Então a alteração aprovada contém null

def test_clear_brand_whatsapp_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        async def handler(request): return httpx.Response(200, json={'data':{'version':'8','whatsappNumber':'5511999999999'}})
        class DB:
            async def fetchrow(self, query, *args):
                assert json.loads(args[4])['whatsapp_number'] is None
                return {'id':uuid.uuid4(), 'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_brand_update(clear_whatsapp=True)
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: anúncio é duplicado somente após aprovação
# Dado anúncio pertencente à campanha
# Quando propõe cópia
# Então registra nome e versão sem executar

def test_ad_duplicate_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        campaign = str(uuid.uuid4())
        async def handler(request):
            assert request.url.path == '/api/campaigns/'+campaign+'/chat-ads/12345'
            return httpx.Response(200, json={'data':{'id':'12345','name':'Anúncio','version':'b'*64}})
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/campaigns/'+campaign+'/chat-ads/12345'
                assert json.loads(args[4]) == {'version':'b'*64,'action':'duplicate','name':'Cópia'}
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_ad_update(campaign,'12345','duplicate','Cópia')
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: criação de anúncio exige aprovação dos recursos de origem
# Dado campanha, conjunto e criativo autorizados
# Quando propõe criar anúncio
# Então apresenta snapshot e cria aprovação sem publicar

def test_ad_create_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        campaign = str(uuid.uuid4())
        async def handler(request):
            assert request.url.path == '/api/campaigns/'+campaign+'/chat-ads-create/snapshot'
            assert request.url.params['adsetId'] == '123'
            assert request.url.params['creativeId'] == '456'
            return httpx.Response(200,json={'data':{'campaignId':campaign,'adsetId':'123','creativeId':'456','version':'c'*64}})
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/campaigns/'+campaign+'/chat-ads-create'
                assert json.loads(args[4]) == {'version':'c'*64,'name':'Anúncio Café','adsetId':'123','creativeId':'456'}
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_ad_create(campaign,'123','456','Anúncio Café')
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: consultar recursos de um anúncio existente
# Dado campanha e anúncio autorizados
# Quando consulta detalhes
# Então recebe conjunto e criativo existentes

def test_ad_details():
    async def run():
        import uuid
        campaign=str(uuid.uuid4())
        async def handler(request):
            assert request.url.path == '/api/campaigns/'+campaign+'/chat-ads/123'
            return httpx.Response(200,json={'data':{'id':'123','adsetId':'456','creativeId':'789'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert (await AdyTools('https://ady.test','delegated',client).ad_details(campaign,'123'))['data']['creativeId'] == '789'
    asyncio.run(run())

# Cenário: troca de criativo apresenta estado e recurso novo
# Dado anúncio e criativo autorizados
# Quando propõe troca
# Então registra snapshot e alteração para aprovação

def test_ad_creative_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        campaign = str(uuid.uuid4())
        async def handler(request):
            assert request.url.params['creativeId'] == '456'
            return httpx.Response(200,json={'data':{'id':'123','targetCreativeId':'456','version':'d'*64}})
        class DB:
            async def fetchrow(self, query, *args):
                assert json.loads(args[4]) == {'version':'d'*64,'action':'creative','creativeId':'456'}
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_ad_update(campaign,'123','creative',creative_id='456')
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: descobrir recursos de anúncio da campanha
# Dado uma campanha autorizada
# Quando consulta conjuntos e criativos vinculados
# Então retorna a lista da API

def test_ad_assets():
    async def run():
        import uuid
        campaign=str(uuid.uuid4())
        async def handler(request):
            assert request.url.path == '/api/campaigns/'+campaign+'/chat-ad-assets'
            return httpx.Response(200,json={'data':{'adsets':[],'creatives':[]},'partial_failures':[]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            assert (await AdyTools('https://ady.test','delegated',client).ad_assets(campaign))['partial_failures'] == []
    asyncio.run(run())

# Cenário: consultar conjuntos e criativos disponíveis
# Dado uma campanha autorizada
# Quando consulta recursos para novo anúncio
# Então recebe recursos inclusive ainda não utilizados

def test_available_ad_assets():
    async def run():
        import uuid
        campaign = str(uuid.uuid4())
        async def handler(request):
            assert request.url.path == '/api/campaigns/'+campaign+'/chat-available-ad-assets'
            return httpx.Response(200,json={'data':{'adsets':[{'id':'1','name':'Conjunto'}],'creatives':[]},'partial_failures':[]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await AdyTools('https://ady.test','delegated',client).available_ad_assets(campaign)
            assert result['data']['adsets'][0]['id'] == '1'
    asyncio.run(run())

# Cenário: número de WhatsApp inválido é rejeitado
# Dado número com menos de 10 dígitos
# Quando propõe atualização de marca
# Então nenhuma alteração é registrada

def test_invalid_whatsapp():
    from tools import ImageProposal
    async def run():
        class DB:
            async def fetchrow(self,*args): raise AssertionError('não deve persistir')
        result = await ImageProposal(DB(),'t','u','c').propose_brand_update(whatsapp_number='123')
        assert 'error' in result
    asyncio.run(run())

# Cenário: ID inválido não dispara leitura de anúncio
# Dado identificador de anúncio não numérico
# Quando solicita detalhes
# Então retorna erro sem chamada HTTP

def test_ad_details_invalid_id():
    async def run():
        import uuid
        class NoHTTP:
            async def get(self,*args,**kwargs): raise AssertionError('não deve consultar')
        result = await AdyTools('https://ady.test','delegated',NoHTTP()).ad_details(str(uuid.uuid4()),'../../secreto')
        assert 'error' in result
    asyncio.run(run())

# Cenário: perfil é atualizado somente após aprovação
# Dado perfil e negócio autenticados
# Quando propõe alteração de nome
# Então apresenta os dados atuais e salva versões para a confirmação

def test_profile_update_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        async def handler(request):
            assert request.url.path == '/api/auth/me/chat-snapshot'
            return httpx.Response(200,json={'data':{'name':'Ana','tenantName':'Loja','businessContext':'Café','userVersion':'4','tenantVersion':'5'}})
        class DB:
            async def fetchrow(self, query, *args):
                assert args[3] == '/api/auth/me/chat-update'
                assert json.loads(args[4]) == {'userVersion':'4','tenantVersion':'5','name':'Maria'}
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_profile_update(name='Maria')
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: perfil sem alterações não gera aprovação
# Dado pedido sem valores
# Quando propõe atualização
# Então retorna erro sem acessar a API

def test_profile_update_requires_change():
    from tools import ImageProposal
    async def run():
        class DB:
            async def fetchrow(self,*args): raise AssertionError('não deve persistir')
        result = await ImageProposal(DB(),'t','u','c').propose_profile_update()
        assert 'error' in result
    asyncio.run(run())

# Cenário: mudança de nome do negócio informa impacto no identificador
# Dado negócio existente
# Quando propõe mudança de nome
# Então a confirmação explica alteração do identificador

def test_tenant_rename_discloses_slug_change():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid
    async def run():
        async def handler(request): return httpx.Response(200,json={'data':{'name':'Ana','tenantName':'Loja','businessContext':'','userVersion':'4','tenantVersion':'5'}})
        class DB:
            async def fetchrow(self,*args): return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result=await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_profile_update(tenant_name='Nova Loja')
            assert 'identificador' in result['parameters']['observação']
    asyncio.run(run())

# Cenário: agendamento UTC pertence ao dia anterior em São Paulo
# Dado horário futuro de madrugada em UTC
# Quando propõe uma postagem para o Instagram
# Então data do calendário usa São Paulo e horário mantém o mesmo instante

def test_post_calendar_date_uses_sao_paulo_timezone():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import json, uuid
    async def run():
        class DB:
            async def fetchrow(self, query, *args):
                body = json.loads(args[4])
                assert body['date'] == '2098-12-31'
                assert body['scheduledAt'] == '2099-01-01T01:00:00Z'
                return {'id':uuid.uuid4(), 'expires_at':datetime.now(timezone.utc)}
        result = await ImageProposal(DB(),'t','u','c').propose_instagram_post('Legenda','image','2099-01-01T01:00:00Z','https://example.invalid/image.png')
        assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: fuso informado cruza meia-noite em São Paulo
# Dado horário futuro em fuso UTC-8
# Quando propõe postagem
# Então usa o dia seguinte em São Paulo e conserva o instante UTC

def test_post_date_uses_sao_paulo_not_input_timezone():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import json, uuid
    async def run():
        class DB:
            async def fetchrow(self, query, *args):
                body = json.loads(args[4])
                assert body['date'] == '2099-01-01'
                assert body['scheduledAt'] == '2099-01-01T03:00:00Z'
                return {'id':uuid.uuid4(), 'expires_at':datetime.now(timezone.utc)}
        result = await ImageProposal(DB(),'t','u','c').propose_instagram_post('Legenda','image','2098-12-31T19:00:00-08:00','https://example.invalid/image.png')
        assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: instrução de edição de imagem usa limite real da API
# Dado ajuste com 600 caracteres, válido no endpoint
# Quando propõe editar a imagem
# Então registra a proposta para aprovação

def test_image_edit_accepts_api_supported_feedback_length():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        asset=str(uuid.uuid4())
        async def handler(request):
            return httpx.Response(200,json={'data':{'id':asset,'type':'image','url':'https://example.invalid/x.png','version':'8'}})
        class DB:
            async def fetchrow(self, query, *args):
                assert len(json.loads(args[4])['feedback']) == 600
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result=await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_edit_image(asset,'a'*600)
            assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: postagem sem legenda segue contrato do planejador
# Dado mídia HTTPS e horário futuro
# Quando propõe postagem com legenda vazia
# Então registra proposta para confirmação

def test_instagram_post_without_caption():
    from tools import ImageProposal
    from datetime import datetime, timezone, timedelta
    import uuid
    async def run():
        class DB:
            async def fetchrow(self,*args): return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        when=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
        result=await ImageProposal(DB(),'t','u','c').propose_instagram_post('','image',when,'https://example.invalid/a.png')
        assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: agendar carrossel com duas imagens
# Dado URLs HTTPS de duas imagens
# Quando propõe postagem tipo carrossel
# Então o corpo preserva ambas para a confirmação

def test_instagram_carousel_proposal():
    from tools import ImageProposal
    from datetime import datetime, timezone, timedelta
    import json, uuid
    async def run():
        urls=['https://example.invalid/1.png','https://example.invalid/2.png']
        class DB:
            async def fetchrow(self,query,*args):
                body=json.loads(args[4])
                assert body['postType'] == 'carousel'
                assert body['imageUrls'] == urls
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        when=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
        result=await ImageProposal(DB(),'t','u','c').propose_instagram_post('Legenda','carousel',when,image_urls=urls)
        assert result['status'] == 'pending'
    asyncio.run(run())

# Cenário: reel sem vídeo não gera proposta inválida
# Dado uma imagem PNG
# Quando propõe reel
# Então informa erro sem registrar aprovação

def test_instagram_reel_rejects_image():
    from tools import ImageProposal
    from datetime import datetime, timezone, timedelta
    async def run():
        class DB:
            async def fetchrow(self,*args): raise AssertionError('não deve persistir')
        when=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
        result=await ImageProposal(DB(),'t','u','c').propose_instagram_post('Legenda','reel',when,'https://example.invalid/a.png')
        assert 'error' in result
    asyncio.run(run())

# Cenário: carrossel com mídia insuficiente ou mista é rejeitado
# Dado um carrossel inválido
# Quando propõe postagem
# Então não registra aprovação

def test_instagram_carousel_rejects_invalid_media():
    from tools import ImageProposal
    from datetime import datetime, timezone, timedelta
    async def run():
        class DB:
            async def fetchrow(self,*args): raise AssertionError('não deve persistir')
        when=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
        proposal=ImageProposal(DB(),'t','u','c')
        assert 'error' in await proposal.propose_instagram_post('','carousel',when,image_urls=['https://example.invalid/a.png'])
        assert 'error' in await proposal.propose_instagram_post('','carousel',when,image_urls=['https://example.invalid/a.png','https://example.invalid/b.mp4'])
    asyncio.run(run())

# Cenário: usuário consulta campanhas além da primeira página
# Dado mais de 20 campanhas
# Quando solicita a página seguinte
# Então a ferramenta encaminha limite e deslocamento à API

def test_campaigns_pagination():
    async def run():
        async def handler(request):
            assert request.url.params['limit'] == '20'
            assert request.url.params['offset'] == '20'
            return httpx.Response(200,json={'data':[{'id':'next'}],'pagination':{'total':21,'limit':20,'offset':20}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result=await AdyTools('https://ady.test','delegated',client).campaigns(limit=20,offset=20)
            assert result['data'][0]['id'] == 'next'
    asyncio.run(run())

# Cenário: encontrar mídia em página posterior
# Dado biblioteca com mais de vinte itens
# Quando consulta página dois de vídeos
# Então envia paginação e filtro à API

def test_assets_pagination_and_type():
    async def run():
        async def handler(request):
            assert request.url.params['page'] == '2'
            assert request.url.params['limit'] == '20'
            assert request.url.params['type'] == 'video'
            return httpx.Response(200,json={'data':[{'id':'older-video'}]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result=await AdyTools('https://ady.test','delegated',client).assets(page=2,limit=20,asset_type='video')
            assert result['data'][0]['id'] == 'older-video'
    asyncio.run(run())

# Cenário: paginação inválida não é encaminhada
# Dado limite de campanhas acima do permitido ou página de mídias inválida
# Quando consulta recursos
# Então recebe erro sem chamada HTTP

def test_invalid_pagination_rejected():
    async def run():
        class NoHTTP:
            async def get(self,*args,**kwargs): raise AssertionError('não deve consultar')
        tools=AdyTools('https://ady.test','delegated',NoHTTP())
        assert 'error' in await tools.campaigns(limit=101)
        assert 'error' in await tools.assets(page=0)
    asyncio.run(run())

# Cenário: imagem não aceita arquivo de vídeo
# Dado uma URL de vídeo MP4
# Quando propõe uma postagem de imagem
# Então recusa antes da confirmação

def test_instagram_image_rejects_video():
    from tools import ImageProposal
    from datetime import datetime, timezone, timedelta
    async def run():
        class DB:
            async def fetchrow(self,*args): raise AssertionError('não deve persistir')
        when=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
        result=await ImageProposal(DB(),'t','u','c').propose_instagram_post('','image',when,'https://example.invalid/a.mp4')
        assert 'error' in result
    asyncio.run(run())

# Cenário: proposta de imagem apresenta resolução aplicada
# Dado pedido de imagem com resolução padrão
# Quando usuário recebe proposta
# Então a resolução efetiva da API está visível antes da confirmação

def test_image_proposal_discloses_resolution():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import json, uuid
    async def run():
        class DB:
            async def fetchrow(self,query,*args):
                assert json.loads(args[3])['resolution'] == '2K'
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        proposal=await ImageProposal(DB(),'t','u','c').propose_image('Uma imagem de café bonito','google/gemini-3.1-flash-image')
        assert proposal['parameters']['resolution'] == '2K'
    asyncio.run(run())

# Cenário: orçamento sem moeda verificada não é proposto em reais
# Dado uma campanha cuja moeda ainda não é validada pela API
# Quando solicita alteração de orçamento
# Então não registra aprovação

def test_campaign_budget_blocked_until_currency_validated():
    from tools import ImageProposal
    import uuid
    async def run():
        class DB:
            async def fetchrow(self,*args): raise AssertionError('não deve persistir')
        async def handler(request):
            return httpx.Response(200,json={'data':{'currency':'USD','version':'a'*64}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_campaign_update(str(uuid.uuid4()),'budget',daily_budget_cents=1000)
            assert 'error' in result
    asyncio.run(run())

# Cenário: moeda desconhecida não é apresentada como reais
# Dado snapshot de campanha sem moeda comprovada
# Quando propõe pausar
# Então valores monetários não são exibidos como BRL

def test_campaign_proposal_hides_unverified_currency_amounts():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid
    async def run():
        campaign=str(uuid.uuid4())
        async def handler(request):
            return httpx.Response(200,json={'data':{'id':campaign,'name':'Campanha','status':'ACTIVE','version':'a'*64,'dailyBudget':1000,'lifetimeBudget':None}})
        class DB:
            async def fetchrow(self,*args): return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result=await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_campaign_update(campaign,'pause')
            assert 'dailyBudget' not in result['parameters']['atual']
            assert 'lifetimeBudget' not in result['parameters']['atual']
    asyncio.run(run())

# Cenário: orçamento em reais exige moeda BRL confirmada
# Dado snapshot de campanha em BRL
# Quando propõe orçamento válido
# Então apresenta valor e salva proposta para confirmação

def test_campaign_budget_requires_verified_brl():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import uuid, json
    async def run():
        campaign=str(uuid.uuid4())
        async def handler(request):
            return httpx.Response(200,json={'data':{'id':campaign,'name':'Café','status':'ACTIVE','version':'a'*64,'currency':'BRL','dailyBudget':1000}})
        class DB:
            async def fetchrow(self,query,*args):
                assert json.loads(args[4])['dailyBudget'] == 2000
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result=await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_campaign_update(campaign,'budget',daily_budget_cents=2000)
            assert result['status'] == 'pending'
            assert result['parameters']['atual']['currency'] == 'BRL'
    asyncio.run(run())

# Cenário: conta em moeda estrangeira ou desconhecida não recebe orçamento em reais
# Dado moeda diferente de BRL ou ausente
# Quando solicita criação de campanha
# Então nenhuma aprovação é registrada

def test_campaign_creation_rejects_unverified_currency():
    from tools import ImageProposal
    async def run():
        class DB:
            async def fetchrow(self,*args): raise AssertionError('não deve persistir')
        for currency in ('USD',None):
            async def handler(request): return httpx.Response(200,json={'data':{'id':'act_123','currency':currency}})
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                result=await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_campaign('Campanha café','OUTCOME_TRAFFIC',500,'act_123')
                assert 'error' in result
    asyncio.run(run())

# Cenário: criação de imagem pode usar referências autorizadas
# Dado pedido com até duas imagens HTTPS
# Quando a proposta é criada
# Então URLs são apresentadas e encaminhadas à API para validação de posse

def test_image_proposal_with_reference_urls():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import json, uuid
    async def run():
        refs=['https://example.invalid/ref.png']
        class DB:
            async def fetchrow(self,query,*args):
                assert json.loads(args[3])['reference_image_urls'] == refs
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        result=await ImageProposal(DB(),'t','u','c').propose_image('Café sobre uma mesa bonita','google/gemini-3.1-flash-image',reference_image_urls=refs)
        assert result['parameters']['reference_image_urls'] == refs
    asyncio.run(run())

# Cenário: criação de vídeo com fotos de referência
# Dado até quatro fotos identificadas por UUID
# Quando propõe vídeo
# Então a aprovação exibe os IDs e os encaminha à API

def test_video_proposal_includes_reference_photo_ids():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import json, uuid
    async def run():
        photos=[str(uuid.uuid4()) for _ in range(4)]
        class DB:
            async def fetchrow(self,query,*args):
                assert json.loads(args[4])['photoIds'] == photos
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={'enabled': True, 'videosRemaining': 1}))) as client:
            proposal=await ImageProposal(DB(),'t','u','c',ady=AdyTools('https://ady.test','delegated',client)).propose_video('Vídeo sobre café gelado','Café servido em copo',photo_ids=photos)
        assert proposal['parameters']['photoIds'] == photos
    asyncio.run(run())

# Cenário: fotos inválidas não geram proposta
# Dado um UUID inválido ou mais de quatro fotos
# Quando propõe vídeo
# Então retorna erro sem persistir aprovação

def test_video_proposal_rejects_invalid_reference_photos():
    from tools import ImageProposal
    import uuid
    async def run():
        class DB:
            async def fetchrow(self,*args): raise AssertionError('não deve persistir')
        proposal=ImageProposal(DB(),'t','u','c')
        assert 'error' in await proposal.propose_video('Vídeo sobre café gelado','Café servido em copo',photo_ids=['inválido'])
        assert 'error' in await proposal.propose_video('Vídeo sobre café gelado','Café servido em copo',photo_ids=[str(uuid.uuid4()) for _ in range(5)])
    asyncio.run(run())

# Cenário: descobrir foto de referência da biblioteca autorizada
# Dado filtro de tipo e uma página solicitada
# Quando consulta a biblioteca da marca
# Então retorna IDs e informa se existe próxima página

def test_brand_photos_pagination_and_filter():
    async def run():
        async def handler(request):
            assert request.url.path == '/api/brand-kit/chat-library'
            assert request.url.params['kind'] == 'produto'
            assert request.url.params['page'] == '2'
            assert request.url.params['limit'] == '20'
            assert request.headers['authorization'] == 'Bearer delegated'
            return httpx.Response(200,json={'success':True,'data':{'items':[{'id':'photo-id','kind':'produto'}],'page':2,'hasMore':True}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await AdyTools('https://ady.test','delegated',client).brand_photos(kind='produto',page=2,limit=20)
            assert result['data']['items'][0]['id'] == 'photo-id'
            assert result['data']['hasMore'] is True
    asyncio.run(run())

# Cenário: parâmetros inválidos não consultam a biblioteca
# Dado filtro desconhecido ou limite acima do permitido
# Quando consulta fotos
# Então recebe erro sem chamada HTTP

def test_brand_photos_invalid_filter_and_pagination():
    async def run():
        class NoHTTP:
            async def get(self,*args,**kwargs): raise AssertionError('não deve consultar')
        tools=AdyTools('https://ady.test','delegated',NoHTTP())
        assert 'error' in await tools.brand_photos(kind='desconhecido')
        assert 'error' in await tools.brand_photos(page=0)
        assert 'error' in await tools.brand_photos(limit=51)
    asyncio.run(run())

# Cenário: falha da biblioteca não expõe detalhes internos
# Dado serviço de fotos indisponível
# Quando consulta a biblioteca
# Então recebe erro sanitizado

def test_brand_photos_upstream_error_is_sanitized():
    async def run():
        async def handler(request): return httpx.Response(503,text='private payload')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await AdyTools('https://ady.test','delegated',client).brand_photos()
            assert 'error' in result and 'private' not in str(result)
    asyncio.run(run())

# Cenário: agente é instruído sobre fotos compatíveis com vídeo
# Dado schema exposto ao Agno
# Quando examina ferramentas de biblioteca e vídeo
# Então ambas indicam os tipos produto e equipe

def test_video_photo_tool_schema_guidance():
    from agno.tools import Function
    from tools import ImageProposal
    library = Function.from_callable(AdyTools('https://ady.test','delegated',None).brand_photos).to_dict()
    video = Function.from_callable(ImageProposal(None,None,None,None).propose_video).to_dict()
    for schema in (library,video):
        assert 'produto' in schema['description']
        assert 'equipe' in schema['description']

# Cenário: criar imagem com fotos da biblioteca
# Dado até dois IDs de fotos
# Quando propõe geração
# Então IDs são encaminhados e exibidos na aprovação

def test_image_proposal_with_photo_ids():
    from tools import ImageProposal
    from datetime import datetime, timezone
    import json, uuid
    async def run():
        ids=[str(uuid.uuid4()),str(uuid.uuid4())]
        class DB:
            async def fetchrow(self, query,*args):
                assert json.loads(args[3])['photo_ids'] == ids
                return {'id':uuid.uuid4(),'expires_at':datetime.now(timezone.utc)}
        result = await ImageProposal(DB(),'t','u','c').propose_image('Uma foto bonita de café','google/gemini-3.1-flash-image',photo_ids=ids)
        assert result['parameters']['photo_ids'] == ids
    asyncio.run(run())

# Cenário: referências conflitantes ou IDs inválidos não geram proposta
# Dado URLs e IDs simultâneos, UUID inválido ou mais de duas fotos
# Quando propõe geração
# Então retorna erro sem persistir

def test_image_proposal_rejects_conflicting_or_invalid_photo_ids():
    from tools import ImageProposal
    import uuid
    async def run():
        class DB:
            async def fetchrow(self,*args): raise AssertionError('não deve persistir')
        proposal=ImageProposal(DB(),'t','u','c')
        args=('Uma foto bonita de café','google/gemini-3.1-flash-image')
        assert 'error' in await proposal.propose_image(*args,photo_ids=['inválido'])
        assert 'error' in await proposal.propose_image(*args,photo_ids=[str(uuid.uuid4()) for _ in range(3)])
        assert 'error' in await proposal.propose_image(*args,photo_ids=[str(uuid.uuid4())],reference_image_urls=['https://example.invalid/a.png'])
    asyncio.run(run())
