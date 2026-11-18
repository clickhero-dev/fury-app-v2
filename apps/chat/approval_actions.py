"""Human review snapshots and durable, at-most-once HTTP dispatch.

The signed identity must carry humanIntent=true. Do not grant that claim to
model/tool traffic. A claim in this journal never replaces Node's consume:
chat_approvals is left approved until Node atomically consumes the exact action.
An interrupted/ambiguous dispatch is never automatically repeated.
"""
import asyncio
import hashlib
import inspect
import json
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from action_outcomes import ActionOutcomes
from approval_repository import ApprovalRepository
from approvals import campaign_currency_confirmable
from streaming import safe_video_job

UNKNOWN = {'code': 'CHAT_OUTCOME_UNCONFIRMED', 'error': 'Não foi possível confirmar o resultado. Confira a ação antes de tentar novamente.'}
FAILED = {'error': 'Não foi possível executar esta ação. Confira os dados antes de criar outra proposta.'}
RESOURCE_CHANGED = {
    'code': 'CHAT_RESOURCE_CHANGED',
    'error': 'O recurso mudou. Solicite uma nova proposta antes de confirmar.',
}
FIXED_POSTS = {
    '/api/studio/ai/generate-image', '/api/studio/video/jobs', '/api/planner/posts',
    '/api/campaigns/create', '/api/studio/ai/chat-edit',
}
UUID_PATTERN = r'[0-9a-f-]{36}'


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    approvalIds: list[UUID] = Field(min_length=1, max_length=10)

    @field_validator('approvalIds')
    @classmethod
    def unique_ids(cls, value):
        if len(set(value)) != len(value):
            raise ValueError('Propostas repetidas')
        return value


class ConfirmInput(ReviewInput):
    reviewToken: UUID
    version: int = Field(strict=True)
    digest: str = Field(strict=True, pattern=r'^[a-f0-9]{64}$')


def decoded(value):
    return json.loads(value) if isinstance(value, str) else value


def explicit_action_failure(result):
    return isinstance(result, dict) and (
        result.get('success') is False or bool(result.get('error')) or bool(result.get('partial_failures')))


def video_outcome(state, result):
    """Submission acknowledgement is not proof of final media creation."""
    if state == 'failed':
        return state, result
    if not isinstance(result, dict):
        return ('unknown', UNKNOWN) if state == 'completed' else (state, result)
    job = result.get('job')
    if isinstance(job, dict):
        safe_job = {key: value for key, value in safe_video_job(job).items() if value is not None}
        result = {**result, 'job': safe_job}
        status = safe_job.get('status')
        if status in ('pending', 'running'):
            return 'processing', result
        if status == 'done' and any(isinstance(safe_job.get(key), str) and safe_job[key]
                                    for key in ('assetId', 'videoUrl')):
            return 'completed', result
        if status == 'error':
            return 'failed', result
        return 'unknown', result
    if result.get('jobId'):
        return 'processing', result
    return 'unknown', UNKNOWN


def allowed_action(method, path):
    if method == 'POST':
        return path in FIXED_POSTS or bool(re.fullmatch(
            rf'/api/(?:studio/video/assets/{UUID_PATTERN}/chat-adjust|campaigns/{UUID_PATTERN}/chat-ads-create)', path))
    if method == 'PATCH':
        return path in ('/api/brand-kit/chat-update', '/api/auth/me/chat-update') or bool(re.fullmatch(
            rf'/api/(?:campaigns/{UUID_PATTERN}/chat-(?:update|ads/[0-9]{{1,32}})|planner/posts/{UUID_PATTERN}/chat-cancel)', path))
    return False


def snapshot(rows):
    return [{
        'id': str(row['id']), 'method': row['method'], 'path': row['path'],
        'body': decoded(row['body']), 'display': decoded(row['display']),
        'expiresAt': row['expires_at'].isoformat(),
    } for row in rows]


def digest_for(items):
    return hashlib.sha256(json.dumps(items, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def public_item(item):
    # These are deterministic units consumed by this capability, NOT remaining
    # allowance. Display metadata is not an authoritative pricing/quota source.
    unit = {
        '/api/studio/ai/generate-image': 'image',
        '/api/studio/video/jobs': 'video',
    }.get(item['path']) if item['method'] == 'POST' else None
    return {
        'id': item['id'], 'method': item['method'], 'path': item['path'],
        'parameters': item['display'] if item['display'] is not None else item['body'],
        'expiresAt': item['expiresAt'],
        'cost': {'known': False, 'value': None},
        'quota': {'known': unit is not None, 'value': {'unit': unit, 'amount': 1} if unit else None},
    }


async def resolve(getter):
    value = getter()
    return await value if inspect.isawaitable(value) else value


class ApprovalActions:
    def __init__(self, pool, http, base_url, identity):
        self.pool, self.http, self.base_url = pool, http, base_url
        self.tenant, self.user = identity['tenantId'], identity['userId']
        self.human_intent = identity.get('humanIntent') is True

    async def require_conversation(self, db, conversation_id):
        found = await db.fetchval("""SELECT id FROM chat_conversations
            WHERE id=$1 AND tenant_id=$2 AND user_id=$3""", conversation_id, self.tenant, self.user)
        if found is None:
            raise HTTPException(404, 'Conversa não encontrada')

    async def rows(self, db, conversation_id, ids):
        rows = await db.fetch("""SELECT id,method,path,body,display,status,expires_at
            FROM chat_approvals WHERE conversation_id=$1 AND tenant_id=$2 AND user_id=$3
            AND id=ANY($4::uuid[]) ORDER BY id FOR UPDATE""", conversation_id, self.tenant, self.user, ids)
        if len(rows) != len(ids):
            raise HTTPException(404, 'Proposta não encontrada')
        indexed = {row['id']: row for row in rows}
        return [indexed[aid] for aid in ids]

    def validate_pending(self, rows):
        now = datetime.now(timezone.utc)
        if any(row['status'] != 'pending' or row['expires_at'] <= now
               or not allowed_action(row['method'], row['path'])
               or not campaign_currency_confirmable(row['path'], decoded(row['display']), decoded(row['body']))
               for row in rows):
            raise HTTPException(409, 'Proposta alterada, indisponível ou expirada. Revise novamente.')

    async def review(self, conversation_id, ids):
        async with self.pool.acquire() as db:
            async with db.transaction():
                await self.require_conversation(db, conversation_id)
                rows = await self.rows(db, conversation_id, ids)
                self.validate_pending(rows)
                items = snapshot(rows)
                digest, token = digest_for(items), uuid4()
                expiry = min(datetime.now(timezone.utc) + timedelta(minutes=10), *(row['expires_at'] for row in rows))
                await db.execute("""INSERT INTO chat_approval_reviews
                    (id,conversation_id,tenant_id,user_id,digest,snapshot,expires_at)
                    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)""",
                    token, conversation_id, self.tenant, self.user, digest, json.dumps(items), expiry)
        return {'reviewToken': str(token), 'version': 1, 'digest': digest,
                'approvalIds': [str(i) for i in ids], 'expiresAt': expiry.isoformat(),
                'items': [public_item(item) for item in items]}

    async def claim(self, conversation_id, data):
        async with self.pool.acquire() as db:
            async with db.transaction():
                await self.require_conversation(db, conversation_id)
                review = await db.fetchrow("""SELECT * FROM chat_approval_reviews
                    WHERE id=$1 AND conversation_id=$2 AND tenant_id=$3 AND user_id=$4 FOR UPDATE""",
                    data.reviewToken, conversation_id, self.tenant, self.user)
                if review is None:
                    raise HTTPException(404, 'Revisão não encontrada')
                items = decoded(review['snapshot'])
                if (data.version != review['version'] or data.digest != review['digest']
                        or digest_for(items) != review['digest']
                        or [str(i) for i in data.approvalIds] != [item['id'] for item in items]):
                    raise HTTPException(409, 'A confirmação não corresponde à revisão.')
                if review['confirmed_at'] is not None:
                    return None
                if review['expires_at'] <= datetime.now(timezone.utc):
                    raise HTTPException(409, 'Revisão expirada.')
                rows = await self.rows(db, conversation_id, data.approvalIds)
                self.validate_pending(rows)
                if digest_for(snapshot(rows)) != review['digest']:
                    raise HTTPException(409, 'Proposta alterada. Revise novamente.')
                for aid in data.approvalIds:
                    claimed = await db.fetchval("""INSERT INTO chat_approval_effects
                        (approval_id,review_id,tenant_id,user_id,state) VALUES($1,$2,$3,$4,'claimed')
                        ON CONFLICT(approval_id) DO NOTHING RETURNING approval_id""",
                        aid, data.reviewToken, self.tenant, self.user)
                    if claimed is None:
                        raise HTTPException(409, 'Ação já confirmada. Confira seu resultado.')
                await db.execute("""UPDATE chat_approvals SET status='approved'
                    WHERE id=ANY($1::uuid[]) AND tenant_id=$2 AND user_id=$3""",
                    data.approvalIds, self.tenant, self.user)
                await db.execute('UPDATE chat_approval_reviews SET confirmed_at=now() WHERE id=$1', data.reviewToken)
        return items

    async def persist(self, approval_id, state, result):
        async with self.pool.acquire() as db:
            async with db.transaction():
                row = await db.fetchrow("""SELECT status,result FROM chat_approvals
                    WHERE id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE""", approval_id, self.tenant, self.user)
                # Node may finish after a network timeout; never destroy that evidence.
                if row['status'] == 'completed' and state in ('unknown', 'failed'):
                    state, result = 'completed', decoded(row['result'])
                if state in ('completed', 'processing') and (
                        not isinstance(result, dict) or explicit_action_failure(result)):
                    state, result = 'unknown', UNKNOWN
                if state == 'failed' and ActionOutcomes.classify(403, {'error': result}) is not None:
                    # Node may have stored its generic failure before Python
                    # receives the typed refusal. Enrich only that known safe
                    # placeholder, never a completed or unrelated result.
                    await ApprovalRepository(db, self.tenant, self.user).record_failure(approval_id, result)
                await db.execute("""UPDATE chat_approval_effects SET state=$1,result=$2::jsonb,finished_at=now()
                    WHERE approval_id=$3 AND tenant_id=$4 AND user_id=$5""",
                    state, json.dumps(result), approval_id, self.tenant, self.user)
                await db.execute("""UPDATE chat_approvals SET
                    status=CASE WHEN status IN ('approved','executing') THEN $1 ELSE status END,
                    result=CASE WHEN result IS NULL THEN $2::jsonb ELSE result END
                    WHERE id=$3 AND tenant_id=$4 AND user_id=$5""",
                    'completed' if state == 'processing' else state, json.dumps(result),
                    approval_id, self.tenant, self.user)

    async def dispatch(self, item, authorization):
        state, result = 'unknown', UNKNOWN
        try:
            response = await self.http.request(
                item['method'], self.base_url.rstrip('/') + item['path'], json=item['body'],
                headers={'Authorization': authorization, 'X-Chat-Approval-Id': item['id']}, timeout=120)
            # A deterministic client refusal is safe to show; server errors and
            # invalid JSON do not establish whether the external effect happened.
            if 400 <= response.status_code < 500:
                state, result = 'failed', RESOURCE_CHANGED if response.status_code == 409 else FAILED
                if response.status_code == 403:
                    try:
                        refusal = ActionOutcomes.classify(403, response.json())
                    except ValueError:
                        refusal = None
                    if refusal is not None:
                        result = refusal.result()
            elif 200 <= response.status_code < 300:
                result = response.json()
                if not isinstance(result, dict) or explicit_action_failure(result):
                    raise ValueError('Invalid action result')
                state = 'processing' if response.status_code == 202 else 'completed'
        except (httpx.HTTPError, ValueError, asyncio.TimeoutError):
            state, result = 'unknown', UNKNOWN
        await self.persist(UUID(item['id']), state, result)

    async def results(self, review_id):
        rows = await self.pool.fetch("""SELECT e.approval_id,e.state,e.result,e.claimed_at,
                a.status AS approval_status,a.result AS approval_result,a.path AS approval_path
            FROM chat_approval_effects e JOIN chat_approvals a ON a.id=e.approval_id
            WHERE e.review_id=$1 AND e.tenant_id=$2 AND e.user_id=$3""", review_id, self.tenant, self.user)
        return {str(row['approval_id']): self.outcome(row) for row in rows}

    @staticmethod
    def outcome(row):
        state, result = row['state'], decoded(row['result'])
        if state == 'claimed':
            state = ('unknown' if row['claimed_at'] < datetime.now(timezone.utc)-timedelta(minutes=5)
                     else 'processing')
        if row['approval_status'] == 'completed' and row['state'] in ('claimed', 'unknown'):
            state, result = 'completed', decoded(row['approval_result'])
        path = row['approval_path']
        is_video = path == '/api/studio/video/jobs' or bool(re.fullmatch(
            rf'/api/studio/video/assets/{UUID_PATTERN}/chat-adjust', path))
        if is_video and state != 'failed':
            authoritative = decoded(row['approval_result'])
            if isinstance(authoritative, dict) and (authoritative.get('jobId') or authoritative.get('job')):
                result = authoritative
        if state in ('completed', 'processing') and explicit_action_failure(result):
            return {'id': str(row['approval_id']), 'status': 'unknown', 'result': UNKNOWN}
        if is_video:
            state, result = video_outcome(state, result)
        elif state == 'completed' and not isinstance(result, dict):
            state, result = 'unknown', UNKNOWN
        return {'id': str(row['approval_id']), 'status': state, 'result': result}

    async def existing_single(self, approval_id):
        review_id = await self.pool.fetchval("""SELECT review_id FROM chat_approval_effects
            WHERE approval_id=$1 AND tenant_id=$2 AND user_id=$3""", approval_id, self.tenant, self.user)
        if review_id is not None:
            return (await self.results(review_id))[str(approval_id)]
        return None

    async def confirm_single(self, approval_id, authorization):
        """Replacement for app.py's legacy single route, sharing the same claim.

        Only call after verifying a signed humanIntent claim (checked again here).
        Replay of a batch item returns that item and never dispatches its siblings.
        """
        if not self.human_intent:
            raise HTTPException(403, 'Confirmação humana delegada obrigatória.')
        existing = await self.existing_single(approval_id)
        if existing is not None:
            return existing
        conversation_id = await self.pool.fetchval("""SELECT conversation_id FROM chat_approvals
            WHERE id=$1 AND tenant_id=$2 AND user_id=$3""", approval_id, self.tenant, self.user)
        if conversation_id is None:
            raise HTTPException(404, 'Proposta não encontrada')
        try:
            data = await self.review(conversation_id, [approval_id])
            body = ConfirmInput(**{key: data[key] for key in ('approvalIds', 'reviewToken', 'version', 'digest')})
            response = await self.confirm(conversation_id, body, authorization)
            return response['items'][0]
        except HTTPException as error:
            if error.status_code == 409:
                existing = await self.existing_single(approval_id)
                if existing is not None:
                    return existing
            raise

    async def confirm(self, conversation_id, data, authorization):
        items = await self.claim(conversation_id, data)
        if items is not None:
            # No transaction or DB lock spans provider I/O. Every claim is already durable.
            for item in items:
                await self.dispatch(item, authorization)
        indexed = await self.results(data.reviewToken)
        outcomes = [indexed[str(aid)] for aid in data.approvalIds]
        good = any(item['status'] in ('completed', 'processing') for item in outcomes)
        bad = any(item['status'] in ('failed', 'unknown') for item in outcomes)
        return {'items': outcomes, 'partialFailure': good and bad}


def create_approval_router(pool_getter, http_client_getter, identity_dependency, base_url_getter):
    router = APIRouter()

    async def human(user=Depends(identity_dependency)):
        if user.get('humanIntent') is not True:
            raise HTTPException(403, 'Confirmação humana delegada obrigatória.')
        return user

    async def service(user):
        return ApprovalActions(await resolve(pool_getter), await resolve(http_client_getter),
                               await resolve(base_url_getter), user)

    @router.post('/conversations/{conversation_id}/approvals/review')
    async def review(conversation_id: UUID, body: ReviewInput, user=Depends(human)):
        return await (await service(user)).review(conversation_id, body.approvalIds)

    @router.post('/conversations/{conversation_id}/approvals/confirm-batch')
    async def confirm(conversation_id: UUID, body: ConfirmInput, request: Request, user=Depends(human)):
        authorization = request.headers.get('authorization', '')
        if not authorization.lower().startswith('bearer '):
            raise HTTPException(401, 'Credencial obrigatória')
        return await (await service(user)).confirm(conversation_id, body, authorization)

    return router
