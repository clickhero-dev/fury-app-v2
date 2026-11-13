"""Funcionalidade: conversas privadas
Cenário: acesso sem token
Dado uma requisição sem credencial
Quando lista conversas
Então retorna 401
"""
import time
import os
os.environ['CHAT_DELEGATION_SECRET'] = 'test-secret-with-at-least-32-characters'
os.environ['DATABASE_URL'] = 'postgresql://localhost/test'
from fastapi.testclient import TestClient
from app import create_app

def test_rejects_unauthenticated():
    with TestClient(create_app()) as client:
        assert client.get('/conversations').status_code == 401

# Cenário: credencial inválida é recusada antes de consultar o banco
# Dado um token assinado com segredo diferente
# Quando o usuário lista conversas
# Então recebe 401

def test_rejects_invalid_signature():
    import jwt
    token = jwt.encode({'actor':'chatbot','userId':'a','tenantId':'b','iat':int(time.time()),'exp':int(time.time())+300,'email':'test@example.invalid','role':'admin','iss':'ady-api','aud':'ady-chat'}, 'wrong-secret-with-at-least-32-characters', algorithm='HS256')
    with TestClient(create_app()) as client:
        assert client.get('/conversations', headers={'Authorization': 'Bearer '+token}).status_code == 401

# Cenário: token delegado com ator incorreto é recusado
# Dado um token válido cujo ator não é chatbot
# Quando o usuário lista conversas
# Então recebe 401

def test_rejects_wrong_actor():
    import jwt
    token = jwt.encode({'actor':'user','userId':'a','tenantId':'b','iat':int(time.time()),'exp':int(time.time())+300,'email':'test@example.invalid','role':'admin','iss':'ady-api','aud':'ady-chat'}, 'test-secret-with-at-least-32-characters', algorithm='HS256')
    with TestClient(create_app()) as client:
        assert client.get('/conversations', headers={'Authorization': 'Bearer '+token}).status_code == 401

# Cenário: listagem respeita usuário e tenant autenticados
# Dado uma identidade delegada válida
# Quando solicita suas conversas
# Então a consulta usa seus identificadores autenticados

def test_list_uses_authenticated_owner():
    import jwt
    from uuid import UUID
    uid = '11111111-1111-4111-8111-111111111111'
    tenant = '22222222-2222-4222-8222-222222222222'
    token = jwt.encode({'actor':'chatbot','userId':uid,'tenantId':tenant,'iat':int(time.time()),'exp':int(time.time())+300,'email':'test@example.invalid','role':'admin','iss':'ady-api','aud':'ady-chat'}, 'test-secret-with-at-least-32-characters', algorithm='HS256')
    class Pool:
        async def fetch(self, query, *args):
            assert args == (UUID(tenant), UUID(uid))
            return []
        async def close(self):
            pass
    app = create_app()
    with TestClient(app) as client:
        app.state.pool = Pool()
        response = client.get('/conversations', headers={'Authorization': 'Bearer '+token})
        assert response.status_code == 200
        assert response.json() == []

# Cenário: token sem tenant válido é recusado
# Dado um token assinado com tenant inválido
# Quando consulta as conversas
# Então recebe 401

def test_rejects_invalid_tenant():
    import jwt
    token = jwt.encode({'actor':'chatbot','userId':'11111111-1111-4111-8111-111111111111','tenantId':'invalid','iat':int(time.time()),'exp':int(time.time())+300,'email':'test@example.invalid','role':'admin','iss':'ady-api','aud':'ady-chat'}, 'test-secret-with-at-least-32-characters', algorithm='HS256')
    with TestClient(create_app()) as client:
        assert client.get('/conversations', headers={'Authorization': 'Bearer '+token}).status_code == 401

# Cenário: aprovação exige identidade
# Dado que não há credencial
# Quando confirma uma proposta
# Então recebe 401

def test_approval_requires_authentication():
    with TestClient(create_app()) as client:
        response = client.post('/approvals/11111111-1111-4111-8111-111111111111/confirm')
        assert response.status_code == 401

# Cenário: retomada requer usuário autenticado
# Dado requisição sem credencial
# Quando tenta retomar resposta
# Então recebe 401

def test_retry_requires_authentication():
    with TestClient(create_app()) as client:
        assert client.post('/conversations/11111111-1111-4111-8111-111111111111/retry').status_code == 401

# Cenário: requisições simultâneas compartilham pool PostgreSQL
# Dado que o serviço ainda não abriu conexões
# Quando duas requisições autenticadas chegam ao mesmo tempo
# Então somente um pool é criado e encerrado

def test_concurrent_requests_create_single_pool(monkeypatch):
    import asyncio
    import httpx
    import jwt
    import app as chat_app
    token = jwt.encode({'actor':'chatbot','userId':'11111111-1111-4111-8111-111111111111','tenantId':'22222222-2222-4222-8222-222222222222','iat':int(time.time()),'exp':int(time.time())+300,'email':'test@example.invalid','role':'admin','iss':'ady-api','aud':'ady-chat'}, os.environ['CHAT_DELEGATION_SECRET'], algorithm='HS256')
    async def run():
        created = []
        class Pool:
            async def fetch(self,*args): return []
            async def close(self): pass
        async def create_pool(*args,**kwargs):
            await asyncio.sleep(0.05)
            created.append(Pool())
            return created[-1]
        monkeypatch.setattr(chat_app.asyncpg,'create_pool',create_pool)
        application = create_app()
        async with application.router.lifespan_context(application):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application), base_url='http://test') as client:
                responses = await asyncio.gather(*(client.get('/conversations',headers={'Authorization':'Bearer '+token}) for _ in range(2)))
                assert all(r.status_code == 200 for r in responses)
        assert len(created) == 1
    asyncio.run(run())

# Cenário: mensagem em branco é rejeitada
# Dado usuário autenticado
# Quando envia somente espaços
# Então recebe 400 sem chamar o modelo

def test_blank_message_is_bad_request():
    import jwt
    token = jwt.encode({'actor':'chatbot','userId':'11111111-1111-4111-8111-111111111111','tenantId':'22222222-2222-4222-8222-222222222222','iat':int(time.time()),'exp':int(time.time())+300,'email':'test@example.invalid','role':'admin','iss':'ady-api','aud':'ady-chat'}, os.environ['CHAT_DELEGATION_SECRET'], algorithm='HS256')
    with TestClient(create_app()) as client:
        response = client.post('/conversations/33333333-3333-4333-8333-333333333333/messages',headers={'Authorization':'Bearer '+token},json={'content':'   '})
        assert response.status_code == 400

# Cenário: delegação com duração excessiva é recusada
# Dado token assinado para mais de cinco minutos
# Quando consulta conversas
# Então recebe 401

def test_rejects_overlong_delegation():
    import jwt
    now = int(time.time())
    token = jwt.encode({'actor':'chatbot','userId':'11111111-1111-4111-8111-111111111111','tenantId':'22222222-2222-4222-8222-222222222222','iat':now,'exp':now+301,'iss':'ady-api','aud':'ady-chat','email':'test@example.invalid','role':'admin'}, os.environ['CHAT_DELEGATION_SECRET'], algorithm='HS256')
    with TestClient(create_app()) as client:
        assert client.get('/conversations',headers={'Authorization':'Bearer '+token}).status_code == 401

# Cenário: delegação sem instante de emissão é recusada
# Dado token assinado sem iat
# Quando acessa o chat
# Então recebe 401

def test_rejects_delegation_without_issued_at():
    import jwt
    now = int(time.time())
    claims = {'actor':'chatbot','userId':'11111111-1111-4111-8111-111111111111','tenantId':'22222222-2222-4222-8222-222222222222','exp':now+60,'iss':'ady-api','aud':'ady-chat','email':'test@example.invalid','role':'admin'}
    token = jwt.encode(claims, os.environ['CHAT_DELEGATION_SECRET'], algorithm='HS256')
    with TestClient(create_app()) as client:
        assert client.get('/conversations',headers={'Authorization':'Bearer '+token}).status_code == 401

# Cenário: token com data de emissão no futuro excessivo é recusado
# Dado token emitido mais de 30 segundos no futuro
# Quando acessa o chat
# Então recebe 401

def test_rejects_delegation_from_future():
    import jwt
    now = int(time.time())
    claims = {'actor':'chatbot','userId':'11111111-1111-4111-8111-111111111111','tenantId':'22222222-2222-4222-8222-222222222222','iat':now+60,'exp':now+360,'iss':'ady-api','aud':'ady-chat','email':'test@example.invalid','role':'admin'}
    token = jwt.encode(claims, os.environ['CHAT_DELEGATION_SECRET'], algorithm='HS256')
    with TestClient(create_app()) as client:
        assert client.get('/conversations',headers={'Authorization':'Bearer '+token}).status_code == 401

# Cenário: delegação expirada não autoriza operações
# Dado token expirado
# Quando consulta conversas
# Então recebe 401

def test_rejects_expired_delegation():
    import jwt
    now = int(time.time())
    claims = {'actor':'chatbot','userId':'11111111-1111-4111-8111-111111111111','tenantId':'22222222-2222-4222-8222-222222222222','iat':now-100,'exp':now-1,'iss':'ady-api','aud':'ady-chat','email':'test@example.invalid','role':'admin'}
    token = jwt.encode(claims, os.environ['CHAT_DELEGATION_SECRET'], algorithm='HS256')
    with TestClient(create_app()) as client:
        assert client.get('/conversations',headers={'Authorization':'Bearer '+token}).status_code == 401

# Cenário: criação de campanha está disponível com orçamento aplicado
# Dado endpoint principal que aplica o orçamento aprovado
# Quando o agente escolhe ferramentas disponíveis
# Então a ferramenta de criação de campanha está disponível

def test_campaign_creation_available_after_brl_validation():
    from app import available_proposal_tools
    from tools import ImageProposal
    proposal = ImageProposal(None,None,None,None)
    assert 'propose_campaign' in [tool.__name__ for tool in available_proposal_tools(proposal)]

# Cenário: snapshot monetário ausente não pode ser confirmado
# Dado proposta de campanha criada antes da validação da moeda
# Quando a aprovação é avaliada
# Então o contrato exige confirmação explícita de BRL

def test_campaign_approval_requires_brl_display():
    from approvals import campaign_currency_confirmable
    assert not campaign_currency_confirmable('/api/campaigns/create', None)
    assert not campaign_currency_confirmable('/api/campaigns/create', {'currency':'USD'})
    assert campaign_currency_confirmable('/api/campaigns/create', {'currency':'BRL'})
    assert campaign_currency_confirmable('/api/planner/posts', None)

# Cenário: orçamento antigo sem moeda confirmada não pode ser aprovado
# Dado proposta de orçamento criada antes da validação BRL
# Quando apresenta estado da proposta
# Então só permanece confirmável com snapshot BRL

def test_budget_approval_requires_brl_snapshot():
    from approvals import campaign_currency_confirmable
    path='/api/campaigns/11111111-1111-4111-8111-111111111111/chat-update'
    assert not campaign_currency_confirmable(path, {'atual':{}}, {'action':'budget'})
    assert not campaign_currency_confirmable(path, {'atual':{'currency':'USD'}}, {'action':'budget'})
    assert campaign_currency_confirmable(path, {'atual':{'currency':'BRL'}}, {'action':'budget'})
    assert campaign_currency_confirmable(path, {'atual':{}}, {'action':'pause'})
