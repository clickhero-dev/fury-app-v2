"""Fence de gravações para que workers com lease expirado não criem propostas."""
class RunExpired(Exception):
    pass

class FencedDB:
    def __init__(self, pool, run_id, lease_id):
        self.pool, self.run_id, self.lease_id = pool, run_id, lease_id

    async def fetchrow(self, query, *args):
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                valid = await conn.fetchval("SELECT 1 FROM chat_response_runs WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>now() FOR UPDATE", self.run_id, self.lease_id)
                if not valid:
                    raise RunExpired()
                return await conn.fetchrow(query, *args)

    async def complete(self, conversation_id, content):
        if not content.strip():
            raise ValueError('Resposta vazia')
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                valid = await conn.fetchval("SELECT 1 FROM chat_response_runs WHERE id=$1 AND lease_id=$2 AND conversation_id=$3 AND status='running' AND lease_until>now() FOR UPDATE", self.run_id, self.lease_id, conversation_id)
                if not valid: raise RunExpired()
                row = await conn.fetchrow("INSERT INTO chat_messages(conversation_id,role,content) VALUES($1,'assistant',$2) RETURNING id,role,content,created_at", conversation_id, content)
                await conn.execute("UPDATE chat_response_runs SET status='completed',updated_at=now() WHERE id=$1 AND lease_id=$2", self.run_id, self.lease_id)
                return row
