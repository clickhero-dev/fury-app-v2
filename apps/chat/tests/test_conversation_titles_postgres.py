"""Funcionalidade: títulos de conversa isolados por proprietário.

Cenário: uma edição manual prevalece sobre um título automático atrasado
Dado que a conversa está aguardando título
Quando o proprietário renomeia e um resultado automático chega depois
Então o título escolhido permanece intacto e outros proprietários não o alteram.
"""
import asyncio
import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest

from conversation_repository import ConversationRepository


@pytest.mark.skipif(not os.getenv('CHAT_TITLE_TEST_DATABASE_URL'), reason='Banco isolado não configurado')
def test_manual_title_and_owner_are_protected_in_postgres():
    async def scenario():
        conn = await asyncpg.connect(os.environ['CHAT_TITLE_TEST_DATABASE_URL'])
        try:
            await conn.execute("CREATE TEMP TABLE chat_conversations (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, user_id uuid NOT NULL, title text NOT NULL)")
            cid, tenant, user, other = uuid4(), uuid4(), uuid4(), uuid4()
            legacy = uuid4()
            await conn.execute("INSERT INTO chat_conversations VALUES ($1,$2,$3,'Nova conversa')", legacy, tenant, user)
            migration = Path(__file__).resolve().parents[3] / 'packages/db/migrations/0069_chat_title_source.sql'
            await conn.execute(migration.read_text())
            assert await conn.fetchval('SELECT title_source FROM chat_conversations WHERE id=$1', legacy) == 'manual'
            await conn.execute("INSERT INTO chat_conversations VALUES ($1,$2,$3,'Nova conversa','pending')", cid, tenant, user)
            owner = ConversationRepository(conn, tenant, user)
            stranger = ConversationRepository(conn, tenant, other)
            assert await stranger.rename(cid, 'Invasão') is None
            assert await stranger.set_automatic(cid, 'Invasão') is None
            assert (await owner.rename(cid, 'Nova conversa'))['title'] == 'Nova conversa'
            assert await owner.set_automatic(cid, 'Título atrasado') is None
            row = await conn.fetchrow('SELECT title,title_source FROM chat_conversations WHERE id=$1', cid)
            assert dict(row) == {'title':'Nova conversa','title_source':'manual'}
        finally:
            await conn.close()
    asyncio.run(scenario())
