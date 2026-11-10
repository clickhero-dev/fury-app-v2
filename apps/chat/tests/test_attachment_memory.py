"""Funcionalidade: compactação mantém anexos consultáveis sem vazar memória de arquivos."""
import asyncio
from uuid import uuid4

import pytest
from attachment_repository import AttachmentRepository
from conversation_repository import ConversationRepository
from memory import consolidate
from test_attachments_postgres import URL, database, attach

pytestmark = pytest.mark.skipif(not URL, reason='CHAT_MEDIA_TEST_DATABASE_URL isolado ausente')


# Dado mensagem anexada resumida, quando compacta, então mantém âncora/GET e releitura.
def test_consolidation_preserves_attachment_anchor_but_compacts_agent_history():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            aid = await attach(pool, tenant, user, cid)
            conversation = ConversationRepository(pool, tenant, user)
            run, _, mid = await conversation.begin_run(cid, 'Analise o arquivo', attachment_ids=[aid])
            await pool.execute("UPDATE chat_response_runs SET status='completed' WHERE id=$1", run)
            await pool.execute("INSERT INTO chat_messages(conversation_id,role,content,created_at) VALUES($1,'assistant','Total 42',now()+interval '1 second')", cid)
            later = await pool.fetchval("INSERT INTO chat_messages(conversation_id,role,content,created_at) VALUES($1,'user','Pergunta nova',now()+interval '2 seconds') RETURNING id", cid)
            attachments = AttachmentRepository(pool, tenant, user)
            async def summarize(previous, messages): return '{"facts":[{"topic":"anexo","text":"Total informado: 42"}]}'
            assert await consolidate(pool, cid, summarize, min_responses=1, message_repository=attachments)
            assert await pool.fetchval('SELECT content FROM chat_messages WHERE id=$1', mid) == 'Analise o arquivo'
            assert await pool.fetchval('SELECT message_id FROM chat_attachments WHERE id=$1', aid) == mid
            assert str(mid) in await attachments.by_message(cid)
            assert [row['id'] for row in await conversation.history(cid)] == [later]
            assert (await attachments.associated(cid))[0]['id'] == aid
    asyncio.run(scenario())


# Dado memória derivada de anexos em outra conversa, então não entra no contexto atual.
def test_memories_from_other_attachment_conversations_are_not_shared():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            other = await pool.fetchval("INSERT INTO chat_conversations(tenant_id,user_id,title) VALUES($1,$2,'Outra') RETURNING id", tenant, user)
            legacy = await pool.fetchval("INSERT INTO chat_conversations(tenant_id,user_id,title) VALUES($1,$2,'Legada') RETURNING id", tenant, user)
            aid = await attach(pool, tenant, user, other)
            await ConversationRepository(pool, tenant, user).begin_run(other, '', attachment_ids=[aid])
            for key, text in ((cid, 'local'), (other, 'private_attachment'), (legacy, 'legacy_fact')):
                await pool.execute('INSERT INTO chat_memories(conversation_id,facts) VALUES($1,$2::jsonb)', key, '[{"text":"'+text+'"}]')
            memories = await ConversationRepository(pool, tenant, user).memories(cid)
            assert len(memories) == 2
            assert 'private_attachment' not in str(memories)
            assert 'legacy_fact' in str(memories) and 'local' in str(memories)
            assert await ConversationRepository(pool, tenant, uuid4()).memories(cid) == []
    asyncio.run(scenario())
