import asyncio
import httpx
import json
from uuid import uuid4
from chat_read_tools import ChatReadTools


def test_guided_profile_retry_uses_same_fenced_operation(monkeypatch):
    import chat_read_tools

    async def no_wait(_):
        pass
    monkeypatch.setattr(chat_read_tools.asyncio, 'sleep', no_wait)

    async def run():
        conversation, run_id, lease = map(str, (uuid4(), uuid4(), uuid4()))
        requests = []
        async def backend(request):
            requests.append(json.loads(request.content))
            if len(requests) == 1:
                raise httpx.ReadTimeout('private', request=request)
            return httpx.Response(200, json={'data': {'tenantName': 'Loja', 'businessContext': 'Café'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(backend)) as client:
            tool = ChatReadTools('https://ady.test', 'delegated', client,
                                 conversation_id=conversation, run_id=run_id, lease_id=lease)
            assert await tool.save_guided_business_context('Loja', 'Café') == {'tenantName': 'Loja', 'businessContext': 'Café'}
        assert len(requests) == 2
        assert requests[0] == requests[1] == {
            'tenantName': 'Loja', 'businessContext': 'Café',
            'conversationId': conversation, 'runId': run_id, 'leaseId': lease,
        }
    asyncio.run(run())


def test_guided_profile_conflict_is_not_retried_and_does_not_leak():
    async def run():
        ids = tuple(str(uuid4()) for _ in range(3))
        calls = []
        async def backend(request):
            calls.append(request)
            return httpx.Response(409, text='private detail')
        async with httpx.AsyncClient(transport=httpx.MockTransport(backend)) as client:
            tool = ChatReadTools('https://ady.test', 'delegated', client,
                                 conversation_id=ids[0], run_id=ids[1], lease_id=ids[2])
            result = await tool.save_guided_business_context('Loja', 'Café')
        assert len(calls) == 1
        assert 'error' in result and 'private' not in str(result)
    asyncio.run(run())


def test_guided_profile_exhausted_transient_error_can_schedule_recovery(monkeypatch):
    import pytest
    from chat_read_tools import ProfileSyncTransient

    async def no_wait(_):
        pass
    monkeypatch.setattr(asyncio, 'sleep', no_wait)

    async def run():
        ids = tuple(str(uuid4()) for _ in range(3))
        calls = []
        async def backend(request):
            calls.append(request)
            raise httpx.ReadTimeout('private token', request=request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(backend)) as client:
            tool = ChatReadTools('https://ady.test', 'delegated', client,
                                 conversation_id=ids[0], run_id=ids[1], lease_id=ids[2])
            with pytest.raises(ProfileSyncTransient) as error:
                await tool.save_guided_business_context('Loja', 'Café')
        assert len(calls) == 3
        assert 'private' not in str(error.value)
    asyncio.run(run())


def test_guided_profile_reconciles_malformed_success_response(monkeypatch):
    async def no_wait(_):
        pass
    monkeypatch.setattr(asyncio, 'sleep', no_wait)

    async def run():
        ids = tuple(str(uuid4()) for _ in range(3))
        calls = []
        async def backend(request):
            calls.append(request)
            return (httpx.Response(200, text='incomplete') if len(calls) == 1
                    else httpx.Response(200, json={'data': {'tenantName': 'Loja', 'businessContext': 'Café'}}))
        async with httpx.AsyncClient(transport=httpx.MockTransport(backend)) as client:
            tool = ChatReadTools('https://ady.test', 'delegated', client,
                                 conversation_id=ids[0], run_id=ids[1], lease_id=ids[2])
            assert await tool.save_guided_business_context('Loja', 'Café') == {'tenantName': 'Loja', 'businessContext': 'Café'}
        assert len(calls) == 2
    asyncio.run(run())


def test_guided_profile_never_accepts_unconfirmed_success(monkeypatch):
    import pytest
    from chat_read_tools import ProfileSyncTransient
    async def no_wait(_):
        pass
    monkeypatch.setattr(asyncio, 'sleep', no_wait)
    async def run():
        ids = tuple(str(uuid4()) for _ in range(3))
        async with httpx.AsyncClient(transport=httpx.MockTransport(
                lambda _: httpx.Response(200, json={'data': {}}))) as client:
            tool = ChatReadTools('https://ady.test', 'delegated', client,
                                 conversation_id=ids[0], run_id=ids[1], lease_id=ids[2])
            with pytest.raises(ProfileSyncTransient):
                await tool.save_guided_business_context('Loja', 'Café')
    asyncio.run(run())


def test_guided_profile_rollout_retries_legacy_validation_error(monkeypatch):
    async def no_wait(_):
        pass
    monkeypatch.setattr(asyncio, 'sleep', no_wait)
    async def run():
        ids = tuple(str(uuid4()) for _ in range(3))
        calls = []
        async def backend(request):
            calls.append(request)
            if len(calls) == 1:
                return httpx.Response(400, json={'error': {'code': 'VALIDATION_ERROR'}})
            return httpx.Response(200, json={'data': {'tenantName': 'Loja', 'businessContext': 'Café'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(backend)) as client:
            tool = ChatReadTools('https://ady.test', 'delegated', client,
                                 conversation_id=ids[0], run_id=ids[1], lease_id=ids[2])
            assert (await tool.save_guided_business_context('Loja', 'Café'))['tenantName'] == 'Loja'
        assert len(calls) == 2
    asyncio.run(run())


def test_promote_attachment_uses_only_the_owned_private_attachment_path():
    async def run():
        conversation, attachment = str(uuid4()), str(uuid4())
        async def backend(request):
            assert request.method == 'POST'
            assert request.url.path == f'/api/chat/conversations/{conversation}/attachments/{attachment}/promote'
            assert request.headers['authorization'] == 'Bearer delegated'
            assert json.loads(request.content) == {'target': 'library', 'kind': 'empresa'}
            return httpx.Response(201, json={'data': {'kind': 'library', 'photos': [{'id': 'p'}]}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(backend)) as client:
            result = await ChatReadTools('https://ady.test', 'delegated', client).promote_attachment(conversation, attachment, 'library', 'empresa')
            assert result == {'kind': 'library', 'photos': [{'id': 'p'}]}
    asyncio.run(run())


def test_promote_attachment_rejects_invalid_ids_or_kind_without_http():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: (_ for _ in ()).throw(AssertionError()))) as client:
            tool = ChatReadTools('https://ady.test', 'delegated', client)
            assert 'error' in await tool.promote_attachment('not-id', 'not-id', 'library', 'secret')
    asyncio.run(run())

def test_quota_only_returns_contract_and_delegated_identity():
    async def run():
        async def fake(req):
            assert req.method == 'GET' and req.url.path == '/api/studio/chat-quotas'
            assert req.headers['authorization'] == 'Bearer delegated' and not req.url.query
            return httpx.Response(200, json={'data':{'subscription':'active','images':{'limit':5,'remaining':0},'videos':{'limit':None,'remaining':None},'provider_balance':999}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client:
            result=await ChatReadTools('https://ady.test','delegated',client).quotas()
            assert result == {'subscription':'active','images':{'limit':5,'remaining':0},'videos':{'limit':None,'remaining':None}}
    asyncio.run(run())

def test_active_quota_withholds_only_the_denied_kind_for_each_delegated_identity():
    async def run():
        identities = {
            'tenant-a-image-role': {'subscription':'active', 'images':{'limit':5, 'remaining':2, 'secret':'hidden'}, 'videos':None},
            'tenant-a-video-role': {'subscription':'active', 'images':None, 'videos':{'limit':4, 'remaining':1}},
            'tenant-b-image-role': {'subscription':'active', 'images':{'limit':9, 'remaining':7}, 'videos':None},
            'tenant-b-video-role': {'subscription':'active', 'images':None, 'videos':{'limit':None, 'remaining':None, 'secret':'hidden'}},
        }
        async def backend(request):
            assert request.url.path == '/api/studio/chat-quotas'
            assert not request.url.query
            identity = request.headers['authorization'].removeprefix('Bearer ')
            return httpx.Response(200, json={'data':{**identities[identity], 'secret':'hidden'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(backend)) as client:
            expected = {
                'tenant-a-image-role': {'subscription':'active', 'images':{'limit':5, 'remaining':2}, 'videos':None},
                'tenant-a-video-role': {'subscription':'active', 'images':None, 'videos':{'limit':4, 'remaining':1}},
                'tenant-b-image-role': {'subscription':'active', 'images':{'limit':9, 'remaining':7}, 'videos':None},
                'tenant-b-video-role': {'subscription':'active', 'images':None, 'videos':{'limit':None, 'remaining':None}},
            }
            for identity, result in expected.items():
                actual = await ChatReadTools('https://ady.test', identity, client).quotas()
                assert actual == result
                assert 'hidden' not in str(actual)
    asyncio.run(run())


def test_quota_denial_and_invalid_partial_payloads_do_not_disclose_data():
    async def run():
        payloads = [
            httpx.Response(403, text='private backend detail'),
            httpx.Response(401, text='private backend detail'),
            httpx.Response(503, text='private backend detail'),
            httpx.Response(200, json={'data':{'subscription':'active', 'images':None, 'videos':{'limit':True, 'remaining':2, 'extra':'private'}}}),
            httpx.Response(200, json={'data':{'subscription':'active', 'images':None, 'videos':{'limit':3}}}),
            httpx.Response(200, json={'data':{'subscription':'active', 'images':None}}),
            httpx.Response(200, json={'data':{'subscription':'active', 'images':None, 'videos':'private'}}),
        ]
        async def backend(request): return payloads.pop(0)
        async with httpx.AsyncClient(transport=httpx.MockTransport(backend)) as client:
            tool = ChatReadTools('https://ady.test', 'denied-role', client)
            for _ in range(len(payloads)):
                assert await tool.quotas() == {'error':'Não foi possível consultar as cotas do plano.'}
    asyncio.run(run())


def test_diagnostic_and_errors_are_sanitized():
    async def run():
        async def fake(req):
            if req.url.path.endswith('diagnostic'):
                return httpx.Response(200,json={'data':{'status':'partial','checks':{'connection':'confirmed','account':'error','pageInstagramLink':'unknown','token':'secret'},'secret':'private'}})
            return httpx.Response(403,text='provider secret')
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client:
            tool=ChatReadTools('https://ady.test','delegated',client)
            assert await tool.meta_ads_diagnostic() == {'status':'partial','checks':{'connection':'confirmed','account':'error','pageInstagramLink':'unknown'}}
            assert 'secret' not in str(await tool.quotas())
    asyncio.run(run())

def test_bad_payload_or_redirect_is_unavailable():
    async def run():
        async def fake(req): return httpx.Response(200,json={'data':{'subscription':'active','images':{'limit':True,'remaining':-1}}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client:
            assert 'error' in await ChatReadTools('https://ady.test','delegated',client).quotas()
    asyncio.run(run())

def test_api_schema_preserves_expired_and_narrowed_meta_checks_without_secrets():
    async def run():
        scopes = ['ads_management', 'ads_read', 'pages_show_list', 'pages_manage_ads']
        checks = {'connection':'confirmed', 'adsAndPagesPermissions':'missing',
                  'account':'inactive', 'page':'not_returned', 'instagram':'unknown',
                  'pageInstagramLink':'missing', 'token':'secret'}
        async def fake(req):
            if req.url.path.endswith('chat-quotas'):
                return httpx.Response(200, json={'data': {'subscription':'expired', 'images':None, 'videos':None, 'token':'secret'}})
            return httpx.Response(200, json={'data': {'status':'partial', 'checks':checks, 'permissionScopes':scopes, 'token':'secret'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client:
            tool = ChatReadTools('https://ady.test', 'delegated', client)
            assert await tool.quotas() == {'subscription':'expired', 'images':None, 'videos':None}
            assert await tool.meta_ads_diagnostic() == {'status':'partial', 'checks':{k:v for k,v in checks.items() if k != 'token'}, 'permissionScopes':scopes}
            checks['page'] = 'missing_advertise'
            assert (await tool.meta_ads_diagnostic())['checks']['page'] == 'missing_advertise'
    asyncio.run(run())

def test_diagnostic_rejects_malformed_or_unrecognized_scopes_and_values_safely():
    async def run():
        payloads = [
            {'status':'partial', 'checks':{'adsAndPagesPermissions':'secret'}, 'permissionScopes':[]},
            {'status':'partial', 'checks':{'adsAndPagesPermissions':'confirmed'}},
            {'status':'partial', 'checks':{}, 'permissionScopes':'secret'},
            {'status':'partial', 'checks':{}, 'permissionScopes':['ads_read', 'secret']},
            {'status':'secret', 'checks':{}, 'permissionScopes':[]},
            {'status':'partial', 'checks':{'page':['secret']}, 'permissionScopes':[]},
            ['secret'],
        ]
        async def fake(req): return httpx.Response(200, json={'data':payloads.pop(0)})
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client:
            tool = ChatReadTools('https://ady.test', 'delegated', client)
            for _ in range(len(payloads)):
                assert await tool.meta_ads_diagnostic() == {'error':'Não foi possível diagnosticar a conexão Meta.'}
    asyncio.run(run())

def test_meta_statuses_and_network_failures_are_safe():
    async def run():
        responses = [
            httpx.Response(200, json={'data':{'status':status, 'checks':{'connection':'unknown'}, 'permissionScopes':[]}})
            for status in ('missing', 'expired', 'error')
        ] + [httpx.Response(302, headers={'Location':'https://other.test/secret'}),
             httpx.Response(500, text='provider secret')]
        async def fake(req):
            assert req.url.host == 'ady.test'
            return responses.pop(0)
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake), follow_redirects=True) as client:
            tool = ChatReadTools('https://ady.test', 'delegated', client)
            for status in ('missing', 'expired', 'error'):
                assert await tool.meta_ads_diagnostic() == {'status':status, 'checks':{'connection':'unknown'}, 'permissionScopes':[]}
            for _ in range(2):
                assert await tool.meta_ads_diagnostic() == {'error':'Não foi possível diagnosticar a conexão Meta.'}
    asyncio.run(run())
