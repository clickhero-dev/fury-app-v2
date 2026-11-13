"""Reconciliação segura de estados desconhecidos de ações síncronas."""

UNKNOWN_MESSAGE = 'Não foi possível confirmar o resultado. Verifique a ação antes de tentar novamente.'

async def reconcile_stale_approvals(db, conversation_id, tenant_id, user_id):
    import json
    await db.execute("""UPDATE chat_approvals SET status='unknown', result=$1::jsonb
        WHERE conversation_id=$2 AND tenant_id=$3 AND user_id=$4 AND status='executing'
          AND execution_started_at < now()-interval '5 minutes'
          AND path <> '/api/studio/video/jobs'
          AND path !~ '^/api/studio/video/assets/[0-9a-f-]{36}/chat-adjust$'""",
        json.dumps({'error':UNKNOWN_MESSAGE}), conversation_id, tenant_id, user_id)

async def mark_unconfirmed_sync_unknown(db, approval_id, tenant_id, user_id):
    import json
    await db.execute("""UPDATE chat_approvals SET status='unknown', result=$1::jsonb
        WHERE id=$2 AND tenant_id=$3 AND user_id=$4 AND status='approved'
          AND path <> '/api/studio/video/jobs'
          AND path !~ '^/api/studio/video/assets/[0-9a-f-]{36}/chat-adjust$'""",
        json.dumps({'error':UNKNOWN_MESSAGE}), approval_id, tenant_id, user_id)


def effective_status(status, expires_at):
    from datetime import datetime, timezone
    if status in ('pending', 'approved') and expires_at <= datetime.now(timezone.utc):
        return 'expired'
    return status


async def reconcile_stale_video_jobs(db, conversation_id, tenant_id, user_id):
    import json
    async with db.acquire() as conn:
        async with conn.transaction():
            rows = await conn.fetch("""SELECT id FROM chat_approvals WHERE conversation_id=$1 AND tenant_id=$2 AND user_id=$3 AND status='executing'
                AND execution_started_at < now()-interval '5 minutes'
                AND (path='/api/studio/video/jobs' OR path ~ '^/api/studio/video/assets/[0-9a-f-]{36}/chat-adjust$') FOR UPDATE""", conversation_id, tenant_id, user_id)
            if not rows:
                return
            await conn.execute("""UPDATE chat_approvals a SET status='unknown', result=$1::jsonb
                WHERE a.id=ANY($2::uuid[]) AND a.tenant_id=$3 AND a.user_id=$4 AND a.status='executing'
                AND NOT EXISTS (SELECT 1 FROM workflow_jobs j WHERE j.id=a.id AND j.tenant_id=a.tenant_id AND j.workflow='studio-video')""",
                json.dumps({'error':UNKNOWN_MESSAGE}), [r['id'] for r in rows], tenant_id, user_id)


def campaign_currency_confirmable(path, display, body=None):
    if path == '/api/campaigns/create':
        return isinstance(display, dict) and display.get('currency') == 'BRL'
    if path.startswith('/api/campaigns/') and path.endswith('/chat-update') and isinstance(body, dict) and body.get('action') == 'budget':
        return isinstance(display, dict) and isinstance(display.get('atual'), dict) and display['atual'].get('currency') == 'BRL'
    return True
