import { sql } from 'drizzle-orm';
import { db as defaultDb, type Database } from '@fury/db';
import type { TurnRecoveryStore, TurnWake } from '../services/chat/chat-turn-recovery-runtime.js';

export class ChatTurnRecoveryRepository implements TurnRecoveryStore {
  constructor(private readonly db: Database = defaultDb) {}

  async list(): Promise<TurnWake[]> {
    // Reconcile bounded pages. Latest run is authoritative even after process death
    // between completed-message commit and recovery-state commit.
    await this.db.execute(sql`WITH candidates AS (
      SELECT t.user_message_id,t.attempts,t.status AS recovery_status,r.status,r.lease_until FROM chat_turn_recovery t
      JOIN chat_conversations c ON c.id=t.conversation_id AND c.tenant_id=t.tenant_id AND c.user_id=t.user_id
      JOIN LATERAL (SELECT status,lease_until FROM chat_response_runs
        WHERE conversation_id=t.conversation_id AND user_message_id=t.user_message_id
        ORDER BY created_at DESC,id DESC LIMIT 1) r ON true
      WHERE (t.status IN ('running','queued') AND (
        r.status='completed' OR t.deadline_at<=clock_timestamp()
        OR t.attempts>=t.max_attempts AND t.status='queued'
        OR t.provider_requests>=t.max_provider_requests
        OR t.reserved_tokens>=t.max_reserved_tokens
        OR t.status='running' AND (r.status='interrupted' OR r.status='running' AND r.lease_until<=clock_timestamp())))
        OR (t.status IN ('stopped','exhausted') AND r.status='completed')
      ORDER BY t.next_attempt_at,t.user_message_id LIMIT 100
    ) UPDATE chat_turn_recovery t SET status=CASE
      WHEN c.status='completed' THEN 'completed'
      WHEN t.deadline_at<=clock_timestamp() OR t.attempts>=t.max_attempts
        OR t.provider_requests>=t.max_provider_requests OR t.reserved_tokens>=t.max_reserved_tokens THEN 'exhausted'
      WHEN EXISTS (SELECT 1 FROM chat_response_runs newer WHERE newer.conversation_id=t.conversation_id
        AND newer.user_message_id<>t.user_message_id AND newer.created_at>t.created_at) THEN 'stopped'
      ELSE 'queued' END FROM candidates c WHERE t.user_message_id=c.user_message_id
        AND t.attempts=c.attempts
        AND t.status=c.recovery_status
        AND (c.recovery_status IN ('running','queued') OR c.status='completed')`);
    const rows = await this.db.execute(sql`SELECT t.tenant_id AS "tenantId",t.user_id AS "userId",
      t.conversation_id AS "conversationId",t.user_message_id AS "userMessageId",r.id AS "runId"
      FROM chat_turn_recovery t
      JOIN chat_conversations c ON c.id=t.conversation_id AND c.tenant_id=t.tenant_id AND c.user_id=t.user_id
      JOIN LATERAL (SELECT id,status FROM chat_response_runs
        WHERE conversation_id=t.conversation_id AND user_message_id=t.user_message_id
        ORDER BY created_at DESC,id DESC LIMIT 1) r ON true
      WHERE t.status='queued' AND t.next_attempt_at<=clock_timestamp()
        AND t.deadline_at>clock_timestamp() AND t.attempts<t.max_attempts
        AND r.status IN ('failed','interrupted','running')
      ORDER BY t.next_attempt_at,t.user_message_id LIMIT 20`);
    return rows as unknown as TurnWake[];
  }

  async stop(item: TurnWake): Promise<void> {
    await this.db.execute(sql`UPDATE chat_turn_recovery t SET status='stopped'
      WHERE t.user_message_id=${item.userMessageId}::uuid AND t.conversation_id=${item.conversationId}::uuid
        AND t.tenant_id=${item.tenantId}::uuid AND t.user_id=${item.userId}::uuid AND t.status='queued'
        AND NOT EXISTS (SELECT 1 FROM chat_response_runs r WHERE r.user_message_id=t.user_message_id
          AND r.conversation_id=t.conversation_id AND r.status='running' AND r.lease_until>clock_timestamp())`);
  }
}
