"""Persisted turn-wide retry, deadline and provider admission; IDs only."""
import httpx
import openai
from attachment_repository import ConversationError
from model_request_budget import is_model_request_budget_error


def transient_failure(error):
    """Do not retry auth, validation, budget, tools or arbitrary runtime failures."""
    if is_model_request_budget_error(error):
        return False
    seen = set()
    while error is not None and id(error) not in seen:
        seen.add(id(error))
        status = getattr(error, 'status_code', None)
        if status is not None:
            return status == 429 or 500 <= status <= 599
        if isinstance(error, (httpx.TimeoutException, httpx.NetworkError,
                              httpx.RemoteProtocolError, openai.APITimeoutError,
                              openai.APIConnectionError, TimeoutError)):
            return True
        # ProviderRunError is emitted by the sanitized SSE adapter.
        from streaming import ProviderRunError
        if isinstance(error, ProviderRunError):
            return error.kind in ('timeout','transient')
        error = getattr(error, '__cause__', None) or getattr(error, '__context__', None)
    return False


class TurnRecovery:
    def __init__(self, db, tenant_id, user_id):
        self.db, self.tenant_id, self.user_id = db, tenant_id, user_id

    async def register(self, conn, conversation_id, message_id):
        await conn.execute('''INSERT INTO chat_turn_recovery
            (user_message_id,conversation_id,tenant_id,user_id)
            VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING''',
            message_id, conversation_id, self.tenant_id, self.user_id)

    async def claim(self, conn, conversation_id, message_id, *, automatic=True):
        admitted = await conn.fetchval('''UPDATE chat_turn_recovery t
            SET status='running',attempts=attempts+1
            WHERE user_message_id=$1 AND conversation_id=$2 AND tenant_id=$3 AND user_id=$4
            AND (status='queued' OR (NOT $5 AND status IN ('running','stopped')))
            AND (NOT $5 OR next_attempt_at<=clock_timestamp())
            AND (NOT $5 OR NOT EXISTS (
                SELECT 1 FROM chat_response_runs newer WHERE newer.conversation_id=t.conversation_id
                AND newer.user_message_id<>t.user_message_id AND newer.created_at>t.created_at))
            AND attempts<max_attempts AND deadline_at>clock_timestamp()
            AND provider_requests<max_provider_requests AND reserved_tokens<max_reserved_tokens
            RETURNING 1''', message_id, conversation_id, self.tenant_id,self.user_id,automatic)
        if not admitted:
            raise ConversationError(409, 'Esta resposta não pode mais ser retomada.', code='recovery_closed')

    async def charge(self, message_id, run_id, lease_id, tokens):
        # Reserve before *each* actual HTTP send; a crash cannot refund spent work.
        admitted = await self.db.fetchval('''UPDATE chat_turn_recovery t
            SET provider_requests=provider_requests+1,reserved_tokens=reserved_tokens+$6
            WHERE user_message_id=$1 AND tenant_id=$2 AND user_id=$3 AND status IN ('running','completed')
            AND deadline_at>clock_timestamp() AND provider_requests<max_provider_requests
            AND reserved_tokens+$6<=max_reserved_tokens AND EXISTS (
                SELECT 1 FROM chat_response_runs r WHERE r.id=$4 AND r.lease_id=$5
                AND r.user_message_id=t.user_message_id AND r.status=t.status
                AND r.lease_until>clock_timestamp()) RETURNING 1''',
            message_id,self.tenant_id,self.user_id,run_id,lease_id,tokens)
        if not admitted:
            raise ConversationError(409, 'Limite seguro desta resposta atingido.', code='recovery_budget')

    async def finish(self, run_id, lease_id, *, transient=False, completed=False):
        # One statement updates the run and schedules its continuation atomically.
        await self.db.execute('''WITH owner AS MATERIALIZED (
            SELECT c.id FROM chat_conversations c
            JOIN chat_response_runs r ON r.conversation_id=c.id
            WHERE r.id=$1 AND r.lease_id=$2 AND c.tenant_id=$5 AND c.user_id=$6
            FOR UPDATE OF c
        ), finished AS (
            UPDATE chat_response_runs SET status=CASE WHEN $4 THEN status ELSE 'failed' END,
                updated_at=clock_timestamp()
            WHERE id=$1 AND lease_id=$2 AND conversation_id IN (SELECT id FROM owner)
                AND ((status='running' AND lease_until>clock_timestamp())
                OR ($4 AND status='completed')) RETURNING user_message_id
        ) UPDATE chat_turn_recovery t SET status=CASE WHEN $4 THEN 'completed'
            WHEN EXISTS (SELECT 1 FROM chat_response_runs newer
                WHERE newer.conversation_id=t.conversation_id
                AND newer.user_message_id<>t.user_message_id AND newer.created_at>t.created_at)
                THEN 'stopped'
            WHEN NOT $3 THEN 'stopped'
            WHEN attempts>=max_attempts OR deadline_at<=clock_timestamp()
                OR provider_requests>=max_provider_requests OR reserved_tokens>=max_reserved_tokens
                THEN 'exhausted' ELSE 'queued' END,
            next_attempt_at=clock_timestamp()+interval '5 seconds'
            WHERE t.user_message_id IN (SELECT user_message_id FROM finished)
            AND t.tenant_id=$5 AND t.user_id=$6
            AND (t.status='running' OR ($4 AND t.status IN ('stopped','exhausted'))) ''',
            run_id,lease_id,transient,completed,self.tenant_id,self.user_id)

    async def cancel(self, conversation_id, run_id):
        async with self.db.acquire() as conn, conn.transaction():
            owned = await conn.fetchval('''SELECT id FROM chat_conversations
                WHERE id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE''',
                conversation_id,self.tenant_id,self.user_id)
            if not owned:
                raise ConversationError(404, 'Conversa não encontrada')
            message_id = await conn.fetchval('SELECT user_message_id FROM chat_response_runs WHERE id=$1 AND conversation_id=$2',run_id,conversation_id)
            if message_id is None:
                raise ConversationError(404, 'Resposta não encontrada')
            completed = await conn.fetchval('''SELECT EXISTS (
                SELECT 1 FROM chat_response_runs WHERE user_message_id=$1
                AND conversation_id=$2 AND status='completed')''',message_id,conversation_id)
            if completed:
                # Completion and cancellation serialize on the conversation
                # lock. Report the winner, including the metadata commit gap.
                await conn.execute('''UPDATE chat_turn_recovery SET status='completed'
                    WHERE user_message_id=$1 AND conversation_id=$2''',message_id,conversation_id)
                return {'status':'completed'}
            await conn.execute('''UPDATE chat_turn_recovery SET status='cancelled'
                WHERE user_message_id=$1 AND status<>'completed' ''',message_id)
            await conn.execute('''UPDATE chat_response_runs SET status='interrupted',
                lease_until=clock_timestamp(),updated_at=clock_timestamp()
                WHERE user_message_id=$1 AND conversation_id=$2 AND status='running' ''',message_id,conversation_id)
        return {'status': 'cancelled'}
