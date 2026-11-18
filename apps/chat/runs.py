"""Fence de gravações para que workers com lease expirado não criem propostas."""
import json
from response_messages import validate_clarification
class RunExpired(Exception):
    pass

class FencedDB:
    def __init__(self, pool, run_id, lease_id):
        self.pool, self.run_id, self.lease_id = pool, run_id, lease_id

    async def heartbeat(self):
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.fetchval("SELECT 1 FROM chat_response_runs WHERE id=$1 FOR UPDATE", self.run_id)
                return await conn.fetchval("UPDATE chat_response_runs SET lease_until=clock_timestamp()+interval '45 seconds',updated_at=clock_timestamp() WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>clock_timestamp() RETURNING 1", self.run_id, self.lease_id)

    async def fetchrow(self, query, *args):
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                conversation_id = await conn.fetchval("SELECT conversation_id FROM chat_response_runs WHERE id=$1", self.run_id)
                if conversation_id is None:
                    raise RunExpired()
                await conn.fetchval("SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE", conversation_id)
                await conn.fetchval("SELECT 1 FROM chat_response_runs WHERE id=$1 FOR UPDATE", self.run_id)
                valid = await conn.fetchval("SELECT 1 FROM chat_response_runs WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>clock_timestamp()", self.run_id, self.lease_id)
                if not valid:
                    raise RunExpired()
                return await conn.fetchrow(query, *args)

    async def complete(self, conversation_id, content):
        return (await self.complete_many(conversation_id, [content]))[0]

    async def complete_many(self, conversation_id, contents, *, clarification=None):
        if clarification is not None:
            clarification = validate_clarification(clarification)
        if not isinstance(contents, list) or not 1 <= len(contents) <= 5 or any(
            not isinstance(content, str) or not content.strip() or len(content) > 110000 for content in contents
        ):
            raise ValueError('Resposta inválida')
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Match begin_run's lock order; timestamp must be assigned only after
                # earlier message transactions have committed.
                await conn.fetchval("SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE", conversation_id)
                await conn.fetchval("SELECT 1 FROM chat_response_runs WHERE id=$1 FOR UPDATE", self.run_id)
                valid = await conn.fetchval("SELECT 1 FROM chat_response_runs WHERE id=$1 AND lease_id=$2 AND conversation_id=$3 AND status='running' AND lease_until>clock_timestamp()", self.run_id, self.lease_id, conversation_id)
                if not valid: raise RunExpired()
                rows = []
                for position, content in enumerate(contents):
                    row = await conn.fetchrow("INSERT INTO chat_messages(conversation_id,role,content,created_at) VALUES($1,'assistant',$2,clock_timestamp()) RETURNING id,role,content,created_at", conversation_id, content)
                    await conn.execute('INSERT INTO chat_response_messages(run_id,position,message_id) VALUES($1,$2,$3)', self.run_id, position, row['id'])
                    rows.append(row)
                if clarification:
                    # The conversation lock serializes this check and insert with
                    # every new user turn and clarification selection.
                    stale = await conn.fetchval('''SELECT EXISTS (
                        SELECT 1 FROM chat_response_runs r
                        JOIN chat_messages origin ON origin.id=r.user_message_id
                        JOIN chat_messages newer ON newer.conversation_id=r.conversation_id
                          AND newer.role='user' AND (newer.created_at,newer.id)>(origin.created_at,origin.id)
                        WHERE r.id=$1)''', self.run_id)
                    await conn.execute('''INSERT INTO chat_clarifications(conversation_id,run_id,message_id,question,choices,dismissed_at)
                        VALUES($1,$2,$3,$4,$5::jsonb,CASE WHEN $6 THEN clock_timestamp() ELSE NULL END)''', conversation_id, self.run_id, rows[-1]['id'], clarification['question'], json.dumps(clarification['choices']), stale)
                await conn.execute("UPDATE chat_response_runs SET status='completed',assistant_message_id=$3,updated_at=now() WHERE id=$1 AND lease_id=$2", self.run_id, self.lease_id, rows[-1]['id'])
                return rows
