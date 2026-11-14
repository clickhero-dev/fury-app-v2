"""Persistência de anexos, sempre vinculada à conversa e ao proprietário."""
import json

MAX_ATTACHMENT_BYTES = 60 * 1024 * 1024


def public_attachment(row):
    data = {'id': str(row['id']), 'filename': row['filename'],
            'mimeType': row['mime_type'], 'sizeBytes': row['size_bytes']}
    metadata = row['metadata']
    if isinstance(metadata, str):
        metadata = json.loads(metadata)
    for key in ('pageCount', 'durationSeconds'):
        value = metadata.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0:
            data[key] = value
    return data


class ConversationError(Exception):
    def __init__(self, status_code, detail, code=None):
        super().__init__(detail)
        self.status_code, self.detail, self.code = status_code, detail, code


class AttachmentRepository:
    def __init__(self, db, tenant_id, user_id):
        self.db, self.tenant_id, self.user_id = db, tenant_id, user_id

    async def summary_rows(self, conn, conversation_id, min_responses, *, lock=False):
        query = '''SELECT m.id,m.role,m.content || COALESCE(
            (SELECT E'\nPergunta de esclarecimento: ' || q.question || E'\nOpções: ' || q.choices::text
             FROM chat_clarifications q WHERE q.message_id=m.id AND q.conversation_id=c.id), '') AS content FROM chat_messages m
            JOIN chat_conversations c ON c.id=m.conversation_id
            LEFT JOIN chat_response_messages rm_outer ON rm_outer.message_id=m.id
            LEFT JOIN chat_response_runs run_outer ON run_outer.id=rm_outer.run_id AND run_outer.conversation_id=c.id
            LEFT JOIN chat_messages owner ON owner.id=run_outer.user_message_id AND owner.conversation_id=c.id
            WHERE c.id=$1 AND c.tenant_id=$2 AND c.user_id=$3
            AND (m.created_at,m.id) <= (SELECT created_at,id FROM chat_messages
                WHERE conversation_id=$1 AND role='assistant'
                  AND NOT EXISTS (SELECT 1 FROM chat_response_messages rm JOIN chat_response_runs r ON r.id=rm.run_id
                    WHERE rm.message_id=chat_messages.id AND r.assistant_message_id IS DISTINCT FROM chat_messages.id)
                ORDER BY created_at,id OFFSET $4 LIMIT 1)
            AND NOT EXISTS (SELECT 1 FROM chat_attachments a WHERE a.message_id=m.id
                AND a.conversation_id=c.id AND a.tenant_id=c.tenant_id AND a.user_id=c.user_id
                AND a.metadata->>'chatMessageCompacted'='true')
            ORDER BY COALESCE(owner.created_at,m.created_at),COALESCE(owner.id,m.id),
                CASE WHEN owner.id IS NULL THEN 0 ELSE 1 END,rm_outer.position,m.created_at,m.id'''
        return await conn.fetch(query + (' FOR UPDATE OF m' if lock else ''),
                                conversation_id, self.tenant_id, self.user_id, min_responses - 1)

    async def prune_summarized(self, conn, conversation_id, message_ids):
        await conn.execute('''UPDATE chat_attachments a
            SET metadata=a.metadata || '{"chatMessageCompacted":true}'::jsonb
            FROM chat_conversations c WHERE c.id=a.conversation_id AND c.id=$1
            AND c.tenant_id=$2 AND c.user_id=$3 AND a.tenant_id=$2 AND a.user_id=$3
            AND a.message_id=ANY($4::uuid[])''', conversation_id, self.tenant_id, self.user_id, message_ids)
        await conn.execute('''DELETE FROM chat_messages m USING chat_conversations c
            WHERE c.id=m.conversation_id AND c.id=$1 AND c.tenant_id=$2 AND c.user_id=$3
            AND m.id=ANY($4::uuid[]) AND NOT EXISTS (
                SELECT 1 FROM chat_attachments a WHERE a.message_id=m.id)''',
            conversation_id, self.tenant_id, self.user_id, message_ids)

    async def exists(self, conversation_id):
        return bool(await self.db.fetchval('''SELECT 1 FROM chat_attachments a
            JOIN chat_conversations c ON c.id=a.conversation_id
            WHERE c.id=$1 AND c.tenant_id=$2 AND c.user_id=$3
            AND a.tenant_id=$2 AND a.user_id=$3 LIMIT 1''',
            conversation_id, self.tenant_id, self.user_id))

    async def remove_all(self, conversation_id):
        await self.db.execute('''DELETE FROM chat_attachments a USING chat_conversations c
            WHERE c.id=a.conversation_id AND c.id=$1 AND c.tenant_id=$2 AND c.user_id=$3
            AND a.tenant_id=$2 AND a.user_id=$3''',
            conversation_id, self.tenant_id, self.user_id)

    async def associated(self, conversation_id, *, through_message_id=None):
        return await self.db.fetch('''SELECT a.id,a.message_id,a.filename,a.mime_type,
            a.size_bytes,a.metadata,a.created_at FROM chat_attachments a
            JOIN chat_conversations c ON c.id=a.conversation_id
            JOIN chat_messages m ON m.id=a.message_id AND m.conversation_id=c.id
            WHERE c.id=$1 AND c.tenant_id=$2 AND c.user_id=$3
            AND a.tenant_id=$2 AND a.user_id=$3
            AND ($4::uuid IS NULL OR (m.created_at,m.id) <= (SELECT created_at,id FROM chat_messages WHERE id=$4 AND conversation_id=c.id))
            AND ($4::uuid IS NULL OR m.id=$4 OR
                NOT EXISTS (SELECT 1 FROM chat_response_runs r WHERE r.user_message_id=m.id) OR
                EXISTS (SELECT 1 FROM chat_response_runs r LEFT JOIN chat_messages reply ON reply.id=r.assistant_message_id
                    WHERE r.user_message_id=m.id AND r.status='completed' AND
                    r.assistant_message_id IS NOT NULL AND (reply.created_at,reply.id) <=
                        (SELECT created_at,id FROM chat_messages WHERE id=$4 AND conversation_id=c.id)))
            ORDER BY m.created_at DESC,a.created_at DESC,a.id''',
            conversation_id, self.tenant_id, self.user_id, through_message_id)

    async def by_message(self, conversation_id):
        grouped = {}
        for row in await self.associated(conversation_id):
            grouped.setdefault(str(row['message_id']), []).append(public_attachment(row))
        return grouped

    async def bind(self, conversation_id, message_id, attachment_ids):
        if not attachment_ids:
            return
        if len(attachment_ids) > 3 or len(set(attachment_ids)) != len(attachment_ids):
            raise ConversationError(400, 'Selecione até três anexos distintos.')
        rows = await self.db.fetch('''SELECT a.id,a.message_id,a.size_bytes,
            a.metadata->>'uploadState' AS upload_state,
            a.created_at > now()-interval '24 hours' AS fresh FROM chat_attachments a
            JOIN chat_conversations c ON c.id=a.conversation_id
            WHERE c.id=$1 AND c.tenant_id=$2 AND c.user_id=$3
            AND a.tenant_id=$2 AND a.user_id=$3 AND a.id=ANY($4::uuid[])
            FOR UPDATE OF a''', conversation_id, self.tenant_id, self.user_id, attachment_ids)
        if len(rows) != len(attachment_ids):
            raise ConversationError(404, 'Anexo não encontrado nesta conversa.')
        if any(row['message_id'] is not None for row in rows):
            raise ConversationError(409, 'Anexo já enviado em outra mensagem.')
        if any(row['upload_state'] == 'pending' for row in rows):
            raise ConversationError(409, 'O envio do anexo ainda está em andamento.')
        if any(not row['fresh'] for row in rows):
            raise ConversationError(400, 'Anexo expirado. Envie o arquivo novamente.')
        if sum(row['size_bytes'] for row in rows) > MAX_ATTACHMENT_BYTES:
            raise ConversationError(400, 'Os anexos excedem o limite combinado de 60 MiB.')
        await self.db.execute('''UPDATE chat_attachments a SET message_id=$4
            FROM chat_conversations c WHERE c.id=a.conversation_id AND c.id=$1
            AND c.tenant_id=$2 AND c.user_id=$3 AND a.tenant_id=$2 AND a.user_id=$3
            AND a.id=ANY($5::uuid[]) AND a.message_id IS NULL''',
            conversation_id, self.tenant_id, self.user_id, message_id, attachment_ids)
