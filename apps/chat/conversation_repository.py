"""Persistência das conversas vinculada ao proprietário autenticado."""
from uuid import uuid4

from attachment_repository import AttachmentRepository, ConversationError


class ConversationRepository:
    def __init__(self, db, tenant_id, user_id):
        self.db = db
        self.tenant_id = tenant_id
        self.user_id = user_id

    async def history(self, conversation_id, through_message_id=None):
        return await self.db.fetch('''SELECT m.id,m.role,m.content FROM chat_messages m
            JOIN chat_conversations c ON c.id=m.conversation_id
            WHERE c.id=$1 AND c.tenant_id=$2 AND c.user_id=$3
            AND NOT EXISTS (SELECT 1 FROM chat_attachments a WHERE a.message_id=m.id
                AND a.conversation_id=c.id AND a.tenant_id=c.tenant_id AND a.user_id=c.user_id
                AND a.metadata->>'chatMessageCompacted'='true')
            AND ($4::uuid IS NULL OR (m.created_at,m.id) <= (SELECT created_at,id FROM chat_messages WHERE id=$4 AND conversation_id=c.id))
            AND ($4::uuid IS NULL OR m.role <> 'user' OR m.id=$4 OR
                NOT EXISTS (SELECT 1 FROM chat_response_runs r WHERE r.user_message_id=m.id) OR
                EXISTS (SELECT 1 FROM chat_response_runs r LEFT JOIN chat_messages a ON a.id=r.assistant_message_id
                    WHERE r.user_message_id=m.id AND r.status='completed' AND
                    r.assistant_message_id IS NOT NULL AND (a.created_at,a.id) <=
                        (SELECT created_at,id FROM chat_messages WHERE id=$4 AND conversation_id=c.id)))
            ORDER BY m.created_at,m.id''', conversation_id, self.tenant_id, self.user_id, through_message_id)

    async def memories(self, conversation_id):
        return await self.db.fetch('''SELECT m.facts FROM chat_memories m
            JOIN chat_conversations c ON c.id=m.conversation_id
            WHERE c.tenant_id=$1 AND c.user_id=$2 AND (c.id=$3 OR NOT EXISTS (
                SELECT 1 FROM chat_attachments a WHERE a.conversation_id=c.id
                AND a.tenant_id=c.tenant_id AND a.user_id=c.user_id AND a.message_id IS NOT NULL))''',
            self.tenant_id, self.user_id, conversation_id)

    async def lock_owned(self, conn, conversation_id):
        owned = await conn.fetchval('SELECT id FROM chat_conversations WHERE id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE',
                                    conversation_id, self.tenant_id, self.user_id)
        if owned is None:
            raise ConversationError(404, 'Conversa não encontrada')

    async def interrupt_expired(self, conn, conversation_id):
        await conn.execute("UPDATE chat_response_runs SET status='interrupted',updated_at=clock_timestamp() WHERE conversation_id=$1 AND status='running' AND lease_until<=clock_timestamp()", conversation_id)

    async def begin_run(self, conversation_id, content='', *, retry=False, retry_run_id=None, attachment_ids=(), client_key=None):
        lease_id = uuid4()
        async with self.db.acquire() as conn:
            async with conn.transaction():
                await self.lock_owned(conn, conversation_id)
                await self.interrupt_expired(conn, conversation_id)
                if client_key is not None and not await conn.fetchval("INSERT INTO chat_send_keys(conversation_id,client_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING client_key", conversation_id, client_key):
                    raise ConversationError(409, 'Envio já registrado. Atualize a conversa.')
                if retry:
                    # Summaries do not carry a causal watermark. Their facts may
                    # describe turns newer than the target, so never guess.
                    if await conn.fetchval('SELECT 1 FROM chat_memories WHERE conversation_id=$1', conversation_id):
                        raise ConversationError(409, 'Não é possível retentar após a compactação desta conversa.', code='retry_compacted')
                    previous = await conn.fetchrow("""SELECT r.user_message_id,r.status FROM chat_response_runs r
                        WHERE r.conversation_id=$1 AND ($2::uuid IS NULL OR r.id=$2)
                        AND NOT EXISTS (SELECT 1 FROM chat_response_runs newer
                          WHERE newer.conversation_id=r.conversation_id AND newer.user_message_id=r.user_message_id
                          AND (newer.created_at,newer.id)>(r.created_at,r.id))
                        ORDER BY r.created_at DESC,r.id DESC LIMIT 1""", conversation_id, retry_run_id)
                    if previous is None or previous['status'] not in ('failed', 'interrupted'):
                        raise ConversationError(409, 'Não há resposta interrompida para retentar.')
                    message_id = previous['user_message_id']
                else:
                    message_id = await conn.fetchval("INSERT INTO chat_messages(conversation_id,role,content,created_at) VALUES ($1,'user',$2,clock_timestamp()) RETURNING id", conversation_id, content)
                    await AttachmentRepository(conn, self.tenant_id, self.user_id).bind(conversation_id, message_id, attachment_ids)
                run_id = await conn.fetchval("INSERT INTO chat_response_runs(conversation_id,user_message_id,lease_id,status,lease_until,created_at,client_key) VALUES($1,$2,$3,'running',clock_timestamp()+interval '45 seconds',clock_timestamp(),$4) RETURNING id", conversation_id, message_id, lease_id, client_key)
                return run_id, lease_id, message_id

    async def delete(self, conversation_id, cleanup):
        """Keep the row lock through private cleanup; Node must not re-lock it.

        Upload/draft removal/begin_run share this lock. No metadata is removed
        until cleanup confirms success; a failed request rolls the transaction back.
        """
        async with self.db.acquire() as conn:
            async with conn.transaction():
                await self.lock_owned(conn, conversation_id)
                await self.interrupt_expired(conn, conversation_id)
                if await conn.fetchval("SELECT 1 FROM chat_response_runs WHERE conversation_id=$1 AND status='running'", conversation_id):
                    raise ConversationError(409, 'Já existe uma resposta em andamento.')
                attachments = AttachmentRepository(conn, self.tenant_id, self.user_id)
                if await attachments.exists(conversation_id):
                    await cleanup()
                    await attachments.remove_all(conversation_id)
                await conn.execute('DELETE FROM chat_conversations WHERE id=$1 AND tenant_id=$2 AND user_id=$3',
                                   conversation_id, self.tenant_id, self.user_id)

    async def rename(self, conversation_id, title):
        return await self.db.fetchrow(
            'UPDATE chat_conversations SET title=$4, title_source=\'manual\' WHERE id=$1 AND tenant_id=$2 AND user_id=$3 RETURNING id,title',
            conversation_id, self.tenant_id, self.user_id, title,
        )

    async def set_automatic(self, conversation_id, title):
        return await self.db.fetchrow(
            """UPDATE chat_conversations SET title=$4, title_source='automatic'
               WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND title_source='pending'
               RETURNING id,title""",
            conversation_id, self.tenant_id, self.user_id, title,
        )
