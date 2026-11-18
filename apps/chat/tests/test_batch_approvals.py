"""Frozen human review and exactly-once dispatch against a real PostgreSQL."""
import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from approval_actions import ApprovalActions, create_approval_router

URL = os.getenv('CHAT_OUTCOME_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='isolated PostgreSQL URL required')


@asynccontextmanager
async def environment():
    schema = 'batch_' + uuid4().hex
    admin = await asyncpg.connect(URL)
    await admin.execute('CREATE SCHEMA ' + schema)
    await admin.execute('SET search_path TO ' + schema)
    await admin.execute("""
        CREATE TABLE chat_conversations(id uuid PRIMARY KEY,tenant_id uuid,user_id uuid);
        CREATE TABLE chat_approvals(id uuid PRIMARY KEY,conversation_id uuid REFERENCES chat_conversations,
          tenant_id uuid,user_id uuid,method text,path text,body jsonb,display jsonb,status text,
          expires_at timestamptz,created_at timestamptz DEFAULT now(),result jsonb,execution_started_at timestamptz);
    """)
    await admin.execute((Path(__file__).parents[3] / 'packages/db/migrations/0082_chat_batch_approvals.sql').read_text())
    pool = await asyncpg.create_pool(URL, min_size=2, max_size=4, server_settings={'search_path': schema})
    tenant, user, conversation = uuid4(), uuid4(), uuid4()
    await pool.execute('INSERT INTO chat_conversations VALUES($1,$2,$3)', conversation, tenant, user)
    ids = [uuid4(), uuid4()]
    for aid in ids:
        await pool.execute("""INSERT INTO chat_approvals(id,conversation_id,tenant_id,user_id,method,path,body,display,status,expires_at)
          VALUES($1,$2,$3,$4,'POST','/api/studio/ai/generate-image','{"prompt":"test"}','{"prompt":"test"}','pending',now()+interval '1 hour')""", aid, conversation, tenant, user)
    claims = {'tenantId': tenant, 'userId': user, 'humanIntent': True}
    calls = []
    mode = ['success']
    async def external(request):
        calls.append(request)
        if mode[0] == 'timeout':
            raise httpx.ReadTimeout('private', request=request)
        if mode[0] == 'known_refusal':
            return httpx.Response(403, json={'error': {'code': 'VIDEO_NOT_IN_PLAN', 'message': 'private'}})
        if mode[0] == 'resource_changed':
            return httpx.Response(409, json={'error': {'message': 'private stale resource'}})
        if mode[0] == 'persisted_timeout':
            aid = UUID(request.headers['x-chat-approval-id'])
            await pool.execute("UPDATE chat_approvals SET status='completed',result='{\"durable\":true}' WHERE id=$1", aid)
            raise httpx.ReadTimeout('private', request=request)
        if mode[0] == 'video_late':
            aid = UUID(request.headers['x-chat-approval-id'])
            await pool.execute("UPDATE chat_approvals SET status='completed',result=$1::jsonb WHERE id=$2",
                               json.dumps({'jobId': str(aid)}), aid)
            raise httpx.ReadTimeout('private', request=request)
        if mode[0] == 'partial' and len(calls) == 1:
            return httpx.Response(403, json={'error': 'private'})
        # Model Node's approved -> executing -> completed contract.
        aid = UUID(request.headers['x-chat-approval-id'])
        changed = await pool.fetchval("UPDATE chat_approvals SET status='executing' WHERE id=$1 AND status='approved' RETURNING id", aid)
        assert changed == aid
        await pool.execute("UPDATE chat_approvals SET status='completed' WHERE id=$1", aid)
        if mode[0] == 'video_accepted':
            return httpx.Response(202, json={'jobId': str(aid)})
        return httpx.Response(202 if mode[0] == 'async' else 200, json={'id': str(aid)})
    outbound = httpx.AsyncClient(transport=httpx.MockTransport(external))
    async def identity():
        if claims.get('unauthorized'):
            raise HTTPException(401, 'unauthorized')
        return claims
    async def get_pool():
        return pool
    app = FastAPI()
    app.state.outbound = outbound
    @app.exception_handler(RequestValidationError)
    async def bad_input(_request, _error):
        return JSONResponse(status_code=400, content={'detail': 'invalid'})
    app.include_router(create_approval_router(get_pool, lambda: outbound, identity, lambda: 'http://node'))
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://chat',
                              headers={'Authorization': 'Bearer delegated'})
    try:
        yield client, pool, claims, conversation, ids, calls, mode
    finally:
        await client.aclose()
        await outbound.aclose()
        await pool.close()
        await admin.execute('DROP SCHEMA ' + schema + ' CASCADE')
        await admin.close()


async def review(client, cid, ids):
    response = await client.post(f'/conversations/{cid}/approvals/review', json={'approvalIds': list(map(str, ids))})
    assert response.status_code == 200, response.text
    return response.json()


async def confirm(client, cid, data):
    return await client.post(f'/conversations/{cid}/approvals/confirm-batch', json={
        key: data[key] for key in ('reviewToken', 'version', 'digest', 'approvalIds')})


def test_frozen_review_and_duplicate_confirmation_dispatch_once():
    async def run():
        async with environment() as (client, pool, claims, cid, ids, calls, _):
            data = await review(client, cid, ids)
            assert data['version'] == 1
            assert len(data['items']) == 2
            assert all(item['cost'] == {'known': False, 'value': None} for item in data['items'])
            assert all(item['quota'] == {'known': True, 'value': {'unit': 'image', 'amount': 1}}
                       for item in data['items'])
            first, second = await asyncio.gather(confirm(client, cid, data), confirm(client, cid, data))
            assert first.status_code == second.status_code == 200
            assert len(calls) == 2
            replay = (await confirm(client, cid, data)).json()
            assert [item['status'] for item in replay['items']] == ['completed', 'completed']
            assert len(calls) == 2
            assert await pool.fetchval("SELECT count(*) FROM chat_approval_effects WHERE state='completed'") == 2
    asyncio.run(run())


@pytest.mark.parametrize('change', ['body', 'display', 'expiry', 'cancelled', 'digest', 'ids', 'version'])
def test_changes_invalidate_entire_batch_without_dispatch(change):
    async def run():
        async with environment() as (client, pool, _, cid, ids, calls, _):
            data = await review(client, cid, ids)
            if change in ('body', 'display'):
                await pool.execute(f"UPDATE chat_approvals SET {change}='{{\"changed\":true}}' WHERE id=$1", ids[0])
            elif change == 'expiry':
                await pool.execute("UPDATE chat_approvals SET expires_at=now()-interval '1 second' WHERE id=$1", ids[0])
            elif change == 'cancelled':
                await pool.execute("UPDATE chat_approvals SET status='cancelled' WHERE id=$1", ids[0])
            elif change == 'digest':
                data['digest'] = '0' * 64
            elif change == 'ids':
                data['approvalIds'] = data['approvalIds'][:1]
            else:
                data['version'] = 2
            assert (await confirm(client, cid, data)).status_code == 409
            assert calls == []
            assert await pool.fetchval('SELECT count(*) FROM chat_approval_effects') == 0
    asyncio.run(run())


@pytest.mark.parametrize('mode_name,expected', [('timeout', ['unknown', 'unknown']), ('partial', ['failed', 'completed'])])
def test_uncertain_effects_are_not_retried_and_partial_failures_are_explicit(mode_name, expected):
    async def run():
        async with environment() as (client, pool, _, cid, ids, calls, mode):
            mode[0] = mode_name
            data = await review(client, cid, ids)
            response = await confirm(client, cid, data)
            assert response.status_code == 200
            assert [i['status'] for i in response.json()['items']] == expected
            assert response.json()['partialFailure'] is (mode_name == 'partial')
            assert [i['status'] for i in (await confirm(client, cid, data)).json()['items']] == expected
            assert len(calls) == 2
            assert 'private' not in response.text
            assert await pool.fetchval("SELECT count(*) FROM chat_approvals WHERE status='approved'") == 0
    asyncio.run(run())


@pytest.mark.parametrize('case,expected', [('empty', 400), ('duplicate', 400), ('too_many', 400),
                                        ('foreign_approval', 404), ('foreign_owner', 404),
                                        ('missing_conversation', 404), ('no_auth', 401), ('not_human', 403)])
def test_boundaries_and_actor_isolation(case, expected):
    async def run():
        async with environment() as (client, _, claims, cid, ids, calls, _):
            selected = list(map(str, ids))
            if case == 'empty': selected = []
            if case == 'duplicate': selected = [selected[0]] * 2
            if case == 'too_many': selected = [str(uuid4()) for _ in range(11)]
            if case == 'foreign_approval': selected = [str(uuid4())]
            if case == 'foreign_owner': claims['tenantId'] = uuid4()
            if case == 'missing_conversation': cid = uuid4()
            if case == 'no_auth': claims['unauthorized'] = True
            if case == 'not_human': claims.pop('humanIntent')
            response = await client.post(f'/conversations/{cid}/approvals/review', json={'approvalIds': selected})
            assert response.status_code == expected, response.text
            assert not calls
    asyncio.run(run())


@pytest.mark.parametrize('case', ['unsupported', 'currency', 'review_expired', 'other_user', 'missing_review'])
def test_rejects_unsafe_actions_and_foreign_reviews(case):
    async def run():
        async with environment() as (client, pool, claims, cid, ids, calls, _):
            if case == 'unsupported':
                await pool.execute("UPDATE chat_approvals SET path='/api/admin/delete' WHERE id=$1", ids[0])
            elif case == 'currency':
                await pool.execute("UPDATE chat_approvals SET path='/api/campaigns/create' WHERE id=$1", ids[0])
            if case in ('unsupported', 'currency'):
                r = await client.post(f'/conversations/{cid}/approvals/review', json={'approvalIds': list(map(str, ids))})
                assert r.status_code == 409
            else:
                data = await review(client, cid, ids)
                if case == 'review_expired':
                    await pool.execute("UPDATE chat_approval_reviews SET expires_at=now()-interval '1 second'")
                elif case == 'other_user':
                    claims['userId'] = uuid4()
                else:
                    data['reviewToken'] = str(uuid4())
                assert (await confirm(client, cid, data)).status_code == (409 if case == 'review_expired' else 404)
            assert not calls
    asyncio.run(run())


def test_crash_after_claim_never_dispatches_and_late_node_completion_is_visible():
    async def run():
        from approval_actions import ConfirmInput
        async with environment() as (client, pool, claims, cid, ids, calls, _):
            data = await review(client, cid, ids)
            service = ApprovalActions(pool, None, 'http://node', claims)
            body = ConfirmInput(**{key: data[key] for key in ('reviewToken', 'version', 'digest', 'approvalIds')})
            assert len(await service.claim(cid, body)) == 2
            response = await confirm(client, cid, data)
            assert [item['status'] for item in response.json()['items']] == ['processing', 'processing']
            await pool.execute("UPDATE chat_approval_effects SET claimed_at=now()-interval '6 minutes'")
            response = await confirm(client, cid, data)
            assert [item['status'] for item in response.json()['items']] == ['unknown', 'unknown']
            await pool.execute("UPDATE chat_approvals SET status='completed',result='{\"late\":true}' WHERE id=$1", ids[0])
            response = await confirm(client, cid, data)
            assert response.json()['items'][0] == {'id': str(ids[0]), 'status': 'completed', 'result': {'late': True}}
            assert not calls
    asyncio.run(run())


def test_single_helper_and_batch_share_the_same_durable_claim():
    async def run():
        async with environment() as (client, pool, claims, cid, ids, calls, mode):
            data = await review(client, cid, ids)
            mode[0] = 'async'
            await confirm(client, cid, data)
            service = ApprovalActions(pool, None, 'http://node', claims)
            single = await service.confirm_single(ids[0], 'Bearer delegated')
            assert single['status'] == 'processing'
            assert len(calls) == 2
    asyncio.run(run())


def test_new_single_helper_dispatches_once_and_preserves_safe_refusal_code():
    async def run():
        async with environment() as (client, pool, claims, cid, ids, calls, mode):
            mode[0] = 'known_refusal'
            service = ApprovalActions(pool, client._transport.app.state.outbound, 'http://node', claims)
            result = await service.confirm_single(ids[0], 'Bearer delegated')
            assert result['status'] == 'failed'
            assert result['result']['code'] == 'VIDEO_NOT_IN_PLAN'
            assert 'private' not in json.dumps(result)
            assert await service.confirm_single(ids[0], 'Bearer delegated') == result
            assert len(calls) == 1
            with pytest.raises(HTTPException) as missing:
                await service.confirm_single(uuid4(), 'Bearer delegated')
            assert missing.value.status_code == 404
            claims['humanIntent'] = False
            untrusted = ApprovalActions(pool, None, 'http://node', claims)
            with pytest.raises(HTTPException) as denied:
                await untrusted.confirm_single(ids[1], 'Bearer delegated')
            assert denied.value.status_code == 403
    asyncio.run(run())


def test_node_durable_result_wins_over_python_timeout():
    async def run():
        async with environment() as (client, pool, _, cid, ids, calls, mode):
            mode[0] = 'persisted_timeout'
            data = await review(client, cid, ids)
            response = await confirm(client, cid, data)
            assert response.status_code == 200
            assert all(item['status'] == 'completed' and item['result'] == {'durable': True}
                       for item in response.json()['items'])
            assert await pool.fetchval("SELECT count(*) FROM chat_approval_effects WHERE state='completed' AND result='{\"durable\":true}'") == 2
            assert await pool.fetchval("SELECT count(*) FROM chat_approvals WHERE status='completed' AND result='{\"durable\":true}'") == 2
            await confirm(client, cid, data)
            assert len(calls) == 2
    asyncio.run(run())


def test_resource_changed_single_is_safe_durable_and_not_redispatched():
    async def run():
        async with environment() as (client, pool, claims, _, ids, calls, mode):
            mode[0] = 'resource_changed'
            service = ApprovalActions(pool, client._transport.app.state.outbound, 'http://node', claims)
            first = await service.confirm_single(ids[0], 'Bearer delegated')
            assert first['status'] == 'failed'
            assert first['result']['code'] == 'CHAT_RESOURCE_CHANGED'
            assert 'private' not in json.dumps(first)
            assert await service.confirm_single(ids[0], 'Bearer delegated') == first
            assert len(calls) == 1
            assert json.loads(await pool.fetchval('SELECT result FROM chat_approval_effects WHERE approval_id=$1', ids[0])) == first['result']
    asyncio.run(run())


@pytest.mark.parametrize('path,quota', [
    ('/api/studio/ai/generate-image', {'known': True, 'value': {'unit': 'image', 'amount': 1}}),
    ('/api/studio/video/jobs', {'known': True, 'value': {'unit': 'video', 'amount': 1}}),
    ('/api/planner/posts', {'known': False, 'value': None}),
    ('/api/studio/ai/chat-edit', {'known': False, 'value': None}),
])
def test_review_uses_only_deterministic_consumption_not_untrusted_display(path, quota):
    async def run():
        async with environment() as (client, pool, _, cid, ids, calls, _):
            await pool.execute("""UPDATE chat_approvals SET path=$1,
                display='{"cost":0,"quota":{"remaining":999,"amount":0},"prompt":"test"}'
                WHERE id=$2""", path, ids[0])
            data = await review(client, cid, ids[:1])
            assert data['items'][0]['quota'] == quota
            assert data['items'][0]['cost'] == {'known': False, 'value': None}
            assert not calls
    asyncio.run(run())


def test_completed_single_duplicate_returns_exact_success_without_http():
    async def run():
        async with environment() as (client, pool, claims, _, ids, calls, _):
            service = ApprovalActions(pool, client._transport.app.state.outbound, 'http://node', claims)
            first = await service.confirm_single(ids[0], 'Bearer delegated')
            assert first == {'id': str(ids[0]), 'status': 'completed', 'result': {'id': str(ids[0])}}
            assert await service.confirm_single(ids[0], 'Bearer delegated') == first
            assert len(calls) == 1
    asyncio.run(run())


@pytest.mark.parametrize('video_path', ['/api/studio/video/jobs', '/api/studio/video/assets/' + str(uuid4()) + '/chat-adjust'])
@pytest.mark.parametrize('mode_name', ['video_accepted', 'video_late'])
def test_video_submission_is_processing_and_reconciles_authoritative_final_job(video_path, mode_name):
    async def run():
        async with environment() as (client, pool, claims, cid, ids, calls, mode):
            mode[0] = mode_name
            await pool.execute('UPDATE chat_approvals SET path=$1 WHERE id=$2', video_path, ids[0])
            data = await review(client, cid, ids[:1])
            submitted = await confirm(client, cid, data)
            assert submitted.status_code == 200
            assert submitted.json()['items'][0] == {'id': str(ids[0]), 'status': 'processing',
                                                   'result': {'jobId': str(ids[0])}}
            running = {'jobId': str(ids[0]), 'job': {'status': 'running', 'stage': 'render'}}
            await pool.execute('UPDATE chat_approvals SET result=$1::jsonb WHERE id=$2', json.dumps(running), ids[0])
            replay = await confirm(client, cid, data)
            assert replay.json()['items'][0]['status'] == 'processing'
            assert replay.json()['items'][0]['result'] == running
            done = {'jobId': str(ids[0]), 'job': {'status': 'done', 'assetId': str(uuid4()), 'videoUrl': 'https://media.invalid/video.mp4'}}
            await pool.execute('UPDATE chat_approvals SET result=$1::jsonb WHERE id=$2', json.dumps(done), ids[0])
            replay = await confirm(client, cid, data)
            assert replay.json()['items'][0] == {'id': str(ids[0]), 'status': 'completed', 'result': done}
            service = ApprovalActions(pool, None, 'http://node', claims)
            assert await service.confirm_single(ids[0], 'Bearer delegated') == replay.json()['items'][0]
            assert len(calls) == 1
    asyncio.run(run())


@pytest.mark.parametrize('job,expected', [
    ({'status': 'pending'}, 'processing'),
    ({'status': 'done'}, 'unknown'),
    ({'status': 'unknown'}, 'unknown'),
    ({'status': 'error', 'error': 'private provider diagnostics'}, 'failed'),
])
def test_video_job_boundary_states_never_claim_unverified_media(job, expected):
    async def run():
        async with environment() as (client, pool, _, cid, ids, calls, mode):
            mode[0] = 'video_accepted'
            await pool.execute("UPDATE chat_approvals SET path='/api/studio/video/jobs' WHERE id=$1", ids[0])
            data = await review(client, cid, ids[:1])
            await confirm(client, cid, data)
            await pool.execute("UPDATE chat_approvals SET result=$1::jsonb WHERE id=$2",
                               json.dumps({'jobId': str(ids[0]), 'job': job}), ids[0])
            replay = await confirm(client, cid, data)
            assert replay.json()['items'][0]['status'] == expected
            assert 'private' not in replay.text
            assert len(calls) == 1
    asyncio.run(run())


@pytest.mark.parametrize('payload', [
    {'success': False, 'diagnostic': 'private'},
    {'error': {'message': 'private'}},
    {'partial_failures': [{'error': 'private'}]},
])
@pytest.mark.parametrize('authoritative', [False, True])
def test_explicit_action_failure_cannot_be_completed_even_from_old_node(payload, authoritative):
    async def run():
        async with environment() as (client, pool, claims, cid, ids, calls, _):
            async def invalid_response(request):
                calls.append(request)
                if authoritative:
                    await pool.execute("UPDATE chat_approvals SET status='completed',result=$1::jsonb WHERE id=$2",
                                       json.dumps(payload), ids[0])
                return httpx.Response(200, json=payload)
            client._transport.app.state.outbound._transport = httpx.MockTransport(invalid_response)
            data = await review(client, cid, ids[:1])
            response = await confirm(client, cid, data)
            assert response.status_code == 200
            assert response.json()['items'][0]['status'] == 'unknown'
            assert response.json()['items'][0]['result']['code'] == 'CHAT_OUTCOME_UNCONFIRMED'
            assert 'private' not in response.text
            replay = await confirm(client, cid, data)
            assert replay.json() == response.json()
            single = await ApprovalActions(pool, None, 'http://node', claims).confirm_single(ids[0], 'Bearer delegated')
            assert single == response.json()['items'][0]
            assert len(calls) == 1
    asyncio.run(run())


def test_resource_status_failed_is_not_an_action_failure_flag():
    async def run():
        async with environment() as (client, pool, _, cid, ids, calls, _):
            result = {'id': str(ids[0]), 'status': 'failed', 'success': True,
                      'error': None, 'partial_failures': []}
            async def renamed_resource(request):
                calls.append(request)
                return httpx.Response(200, json=result)
            client._transport.app.state.outbound._transport = httpx.MockTransport(renamed_resource)
            data = await review(client, cid, ids[:1])
            response = await confirm(client, cid, data)
            assert response.json()['items'][0] == {'id': str(ids[0]), 'status': 'completed', 'result': result}
            assert len(calls) == 1
    asyncio.run(run())
