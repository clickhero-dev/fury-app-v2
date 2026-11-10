"""Funcionalidade: consolidação transacional de memória
Cenário: resumo válido substitui cinco pares de mensagens
Dado cinco interações persistidas
Quando o resumo é salvo
Então as mensagens são removidas e os fatos persistem
Cenário: resumo inválido preserva mensagens
Dado cinco interações persistidas
Quando a consolidação falha
Então as mensagens permanecem disponíveis
"""
import asyncio
import os
import uuid
import pytest
import asyncpg
from memory import consolidate

URL = os.getenv('CHAT_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='CHAT_TEST_DATABASE_URL ausente')

async def setup():
    conn = await asyncpg.connect(URL)
    await conn.execute('CREATE TEMP TABLE chat_messages (id uuid primary key, conversation_id uuid, role text, content text, created_at timestamptz)')
    await conn.execute("CREATE TEMP TABLE chat_memories (conversation_id uuid primary key, facts jsonb, updated_at timestamptz default now())")
    cid = uuid.uuid4()
    for i in range(10):
        await conn.execute("INSERT INTO chat_messages VALUES($1,$2,$3,$4,now()+$5 * interval '1 second')", uuid.uuid4(), cid, 'user' if i%2 == 0 else 'assistant', str(i), i)
    class Acquire:
        async def __aenter__(self): return conn
        async def __aexit__(self, *args): return False
    class Pool:
        def acquire(self): return Acquire()
    return conn, cid, Pool()

def test_consolidation_success():
    async def run():
        conn, cid, pool = await setup()
        try:
            async def summary(previous, messages):
                return '{"facts":[{"topic":"marca","text":"café"}]}'
            assert await consolidate(pool, cid, summary)
            assert await conn.fetchval('SELECT count(*) FROM chat_messages') == 0
            assert await conn.fetchval('SELECT count(*) FROM chat_memories') == 1
        finally: await conn.close()
    asyncio.run(run())

def test_consolidation_failure_preserves_messages():
    async def run():
        conn, cid, pool = await setup()
        try:
            async def summary(previous, messages): return 'invalid'
            with pytest.raises(ValueError): await consolidate(pool, cid, summary)
            assert await conn.fetchval('SELECT count(*) FROM chat_messages') == 10
        finally: await conn.close()
    asyncio.run(run())

# Cenário: falha de compressão mantém todos os fatos
# Dado uma memória existente
# Quando o resumo de compressão é inválido
# Então a transação preserva a memória original

def test_compression_failure_preserves_memory():
    from memory import compress_memories
    async def run():
        conn, cid, pool = await setup()
        tenant, user = uuid.uuid4(), uuid.uuid4()
        try:
            await conn.execute('CREATE TEMP TABLE chat_conversations (id uuid primary key, tenant_id uuid, user_id uuid)')
            await conn.execute('INSERT INTO chat_conversations VALUES($1,$2,$3)', cid, tenant, user)
            await conn.execute('INSERT INTO chat_memories(conversation_id,facts) VALUES($1,$2::jsonb)', cid, '[{"topic":"x","text":"detalhe"}]')
            async def invalid(facts): return 'invalid'
            with pytest.raises(ValueError): await compress_memories(pool, tenant, user, invalid)
            assert 'detalhe' in await conn.fetchval('SELECT facts FROM chat_memories WHERE conversation_id=$1', cid)
        finally: await conn.close()
    asyncio.run(run())

# Cenário: falhas de geração anteriores não bloqueiam consolidação
# Dado cinco respostas concluídas e mensagens de tentativas anteriores sem resposta
# Quando o resumo é salvo
# Então todas as mensagens anteriores à quinta resposta são consolidadas

def test_consolidation_handles_unanswered_messages():
    async def run():
        from datetime import datetime, timezone, timedelta
        conn, cid, pool = await setup()
        try:
            for n in range(2):
                await conn.execute("INSERT INTO chat_messages VALUES($1,$2,'user','tentativa anterior',$3)", uuid.uuid4(), cid, datetime.now(timezone.utc)-timedelta(minutes=1,seconds=n))
            captured = []
            async def summary(previous, messages):
                captured.extend(messages)
                return '{"facts":[{"topic":"marca","text":"café"}]}'
            assert await consolidate(pool, cid, summary)
            assert len(captured) == 12
            assert await conn.fetchval('SELECT count(*) FROM chat_messages') == 0
        finally: await conn.close()
    asyncio.run(run())

# Cenário: sumarização externa não retém transação PostgreSQL
# Dado cinco interações persistidas
# Quando o modelo produz o resumo
# Então nenhuma transação fica aberta aguardando rede

def test_summary_does_not_hold_db_transaction():
    async def run():
        conn, cid, pool = await setup()
        pid = conn.get_server_pid()
        try:
            async def summary(previous, messages):
                observer = await asyncpg.connect(URL)
                try:
                    state = await observer.fetchval('SELECT state FROM pg_stat_activity WHERE pid=$1', pid)
                    assert state != 'idle in transaction'
                finally: await observer.close()
                return '{"facts":[{"topic":"marca","text":"café"}]}'
            assert await consolidate(pool, cid, summary)
        finally: await conn.close()
    asyncio.run(run())

# Cenário: mensagens mudam durante resumo
# Dado um resumo calculado sobre mensagens antigas
# Quando o conteúdo muda antes da gravação
# Então o resumo obsoleto é descartado sem excluir mensagens

def test_consolidation_rejects_stale_snapshot():
    async def run():
        conn, cid, pool = await setup()
        try:
            async def summary(previous, messages):
                await conn.execute('UPDATE chat_messages SET content=$1 WHERE id=$2', 'alterado', messages[0]['id'])
                return '{"facts":[{"topic":"marca","text":"café"}]}'
            assert not await consolidate(pool, cid, summary)
            assert await conn.fetchval('SELECT count(*) FROM chat_messages') == 10
            assert await conn.fetchval('SELECT count(*) FROM chat_memories') == 0
        finally: await conn.close()
    asyncio.run(run())

# Cenário: compressão externa não retém transação PostgreSQL
# Dado memória estruturada
# Quando o modelo comprime os fatos
# Então a conexão não permanece em transação durante a chamada externa

def test_compression_does_not_hold_db_transaction():
    from memory import compress_memories
    async def run():
        conn, cid, pool = await setup()
        tenant, user = uuid.uuid4(), uuid.uuid4()
        try:
            await conn.execute('CREATE TEMP TABLE chat_conversations (id uuid primary key, tenant_id uuid, user_id uuid)')
            await conn.execute('INSERT INTO chat_conversations VALUES($1,$2,$3)', cid, tenant, user)
            await conn.execute('INSERT INTO chat_memories(conversation_id,facts) VALUES($1,$2::jsonb)', cid, '[{"topic":"marca","text":"Uma descrição longa da marca"}]')
            async def summary(facts):
                observer = await asyncpg.connect(URL)
                try:
                    state = await observer.fetchval('SELECT state FROM pg_stat_activity WHERE pid=$1', conn.get_server_pid())
                    assert state != 'idle in transaction'
                finally: await observer.close()
                return '{"facts":[{"topic":"marca","text":"curta"}]}'
            await compress_memories(pool, tenant, user, summary)
        finally: await conn.close()
    asyncio.run(run())

# Cenário: compressão não sobrescreve memória alterada simultaneamente
# Dado memória lida antes da chamada ao modelo
# Quando outro processo atualiza os fatos durante a chamada
# Então a compressão falha preservando os fatos novos

def test_compression_rejects_stale_facts():
    from memory import compress_memories
    async def run():
        conn, cid, pool = await setup()
        tenant, user = uuid.uuid4(), uuid.uuid4()
        try:
            await conn.execute('CREATE TEMP TABLE chat_conversations (id uuid primary key, tenant_id uuid, user_id uuid)')
            await conn.execute('INSERT INTO chat_conversations VALUES($1,$2,$3)', cid, tenant, user)
            await conn.execute('INSERT INTO chat_memories(conversation_id,facts) VALUES($1,$2::jsonb)', cid, '[{"topic":"marca","text":"descrição comprida inicial"}]')
            async def summary(facts):
                await conn.execute('UPDATE chat_memories SET facts=$1::jsonb WHERE conversation_id=$2','[{"topic":"marca","text":"fato atualizado"}]',cid)
                return '{"facts":[{"topic":"marca","text":"curta"}]}'
            with pytest.raises(ValueError): await compress_memories(pool, tenant, user, summary)
            assert 'fato atualizado' in await conn.fetchval('SELECT facts FROM chat_memories WHERE conversation_id=$1', cid)
        finally: await conn.close()
    asyncio.run(run())

# Cenário: limite de contexto força compactação antes de cinco respostas
# Dado duas interações concluídas e mensagens posteriores
# Quando a compactação é solicitada para duas respostas
# Então resume o prefixo concluído e preserva as mensagens posteriores

def test_early_consolidation_preserves_later_messages():
    async def run():
        conn, cid, pool = await setup()
        try:
            async def summary(previous, messages):
                assert len(messages) == 4
                return '{"facts":[{"topic":"marca","text":"café"}]}'
            assert await consolidate(pool, cid, summary, min_responses=2)
            assert await conn.fetchval('SELECT count(*) FROM chat_messages') == 6
        finally: await conn.close()
    asyncio.run(run())

# Cenário: resumo acima do limite não descarta o histórico
# Dado resposta do modelo com fato maior que o limite de armazenamento
# Quando tenta consolidar as mensagens
# Então o resumo é rejeitado e as mensagens originais são preservadas

def test_oversized_summary_preserves_original_messages():
    import json
    async def run():
        conn, cid, pool = await setup()
        try:
            async def summary(previous, messages):
                return json.dumps({'facts':[{'topic':'marca','text':'x'*4001}]})
            with pytest.raises(ValueError):
                await consolidate(pool, cid, summary)
            assert await conn.fetchval('SELECT count(*) FROM chat_messages') == 10
            assert await conn.fetchval('SELECT count(*) FROM chat_memories') == 0
        finally:
            await conn.close()
    asyncio.run(run())
