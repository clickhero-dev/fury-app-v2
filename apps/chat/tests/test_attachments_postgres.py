"""Funcionalidade: associação de anexos atômica e isolada no PostgreSQL real."""
import asyncio
import os
import re
from urllib.parse import urlparse
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest
from conversation_repository import ConversationRepository

URL = os.getenv('CHAT_MEDIA_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='CHAT_MEDIA_TEST_DATABASE_URL isolado ausente')


@asynccontextmanager
async def database():
    """Schema descartável em conexão explicitamente fornecida para testes."""
    parsed = urlparse(URL or '')
    if (parsed.scheme not in ('postgres', 'postgresql') or parsed.hostname != '127.0.0.1'
            or not re.fullmatch(r'/[A-Za-z0-9_]+_isolated', parsed.path)
            or parsed.query or parsed.fragment):
        raise ValueError('CHAT_MEDIA_TEST_DATABASE_URL must target an explicit disposable 127.0.0.1/*_isolated DB')
    schema = 'chat_media_' + uuid4().hex
    admin = await asyncpg.connect(URL)
    pool = None
    try:
        await admin.execute(f'CREATE SCHEMA {schema}')
        await admin.execute(f'SET search_path TO {schema}')
        await admin.execute('CREATE TABLE tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid()); CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid())')
        migrations = Path(__file__).resolve().parents[3] / 'packages/db/migrations'
        for name in ('0059_chat.sql', '0060_chat_approvals.sql', '0061_chat_memory.sql',
                     '0062_chat_approval_result.sql', '0063_chat_approval_display.sql',
                     '0064_chat_approval_failed.sql', '0066_chat_response_runs.sql',
                     '0067_chat_approval_unknown.sql', '0069_chat_title_source.sql', '0070_chat_attachments.sql'):
            await admin.execute((migrations / name).read_text())
        pool = await asyncpg.create_pool(URL, min_size=1, max_size=6, server_settings={'search_path': schema})
        tenant, user = uuid4(), uuid4()
        await pool.execute('INSERT INTO tenants VALUES($1)', tenant)
        await pool.execute('INSERT INTO users VALUES($1)', user)
        cid = await pool.fetchval("INSERT INTO chat_conversations(tenant_id,user_id,title,title_source) VALUES($1,$2,'Nova conversa','pending') RETURNING id", tenant, user)
        yield pool, tenant, user, cid
    finally:
        if pool:
            await pool.close()
        await admin.execute(f'DROP SCHEMA {schema} CASCADE')
        await admin.close()


async def attach(pool, tenant, user, cid, *, filename='grafico.png', size=1024, age=0):
    return await pool.fetchval('''INSERT INTO chat_attachments
        (id,tenant_id,user_id,conversation_id,filename,mime_type,size_bytes,storage_key,created_at)
        VALUES(gen_random_uuid(),$1,$2,$3,$4,'image/png',$5,$6,now()-$7*interval '1 hour') RETURNING id''',
        tenant, user, cid, filename, size, uuid4().hex, age)


# Dado anexos próprios, quando inicia resposta, então grava mensagem/vínculos/run juntos.
def test_begin_run_binds_attachments_and_retry_reuses_original_ids():
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            aid = await attach(pool, tenant, user, cid)
            repo = ConversationRepository(pool, tenant, user)
            run_id, lease, mid = await repo.begin_run(cid, '', attachment_ids=[aid])
            assert await pool.fetchval('SELECT message_id FROM chat_attachments WHERE id=$1', aid) == mid
            assert await pool.fetchval('SELECT content FROM chat_messages WHERE id=$1', mid) == ''
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", run_id)
            retried, new_lease, reused = await repo.begin_run(cid, retry=True)
            assert reused == mid
            assert retried != run_id and new_lease != lease
            assert await pool.fetchval('SELECT count(*) FROM chat_messages WHERE conversation_id=$1', cid) == 1
            assert await pool.fetchval('SELECT message_id FROM chat_attachments WHERE id=$1', aid) == mid
    asyncio.run(scenario())


# Dado anexo inválido, quando tenta associar, então rollback não deixa mensagem/run.
@pytest.mark.parametrize('case,status', [
    ('tenant', 404), ('user', 404), ('conversation', 404), ('missing', 404),
    ('expired', 400), ('used', 409), ('pending', 409), ('oversized', 400), ('duplicate', 400), ('too_many', 400),
])
def test_invalid_attachments_roll_back(case, status):
    from attachment_repository import ConversationError
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            aid = await attach(pool, tenant, user, cid)
            ids = [aid]
            if case in ('tenant', 'user', 'conversation'):
                column = {'tenant':'tenant_id', 'user':'user_id', 'conversation':'conversation_id'}[case]
                other = uuid4()
                if case == 'conversation':
                    other = await pool.fetchval("INSERT INTO chat_conversations(tenant_id,user_id,title) VALUES($1,$2,'Outra') RETURNING id", tenant, user)
                else:
                    table = 'tenants' if case == 'tenant' else 'users'
                    await pool.execute(f'INSERT INTO {table} VALUES($1)', other)
                await pool.execute(f'UPDATE chat_attachments SET {column}=$1 WHERE id=$2', other, aid)
            elif case == 'missing': ids = [uuid4()]
            elif case == 'expired': await pool.execute("UPDATE chat_attachments SET created_at=now()-interval '24 hours' WHERE id=$1", aid)
            elif case == 'pending': await pool.execute("UPDATE chat_attachments SET metadata='{\"uploadState\":\"pending\"}'::jsonb WHERE id=$1", aid)
            elif case == 'used':
                mid = await pool.fetchval("INSERT INTO chat_messages(conversation_id,role,content) VALUES($1,'user','Anterior') RETURNING id", cid)
                await pool.execute('UPDATE chat_attachments SET message_id=$1 WHERE id=$2', mid, aid)
            elif case == 'oversized':
                await pool.execute('UPDATE chat_attachments SET size_bytes=$1 WHERE id=$2', 40 * 1024 * 1024, aid)
                ids.append(await attach(pool, tenant, user, cid, size=21 * 1024 * 1024))
            elif case == 'duplicate': ids *= 2
            elif case == 'too_many': ids.extend([await attach(pool, tenant, user, cid) for _ in range(3)])
            before = await pool.fetchval('SELECT count(*) FROM chat_messages')
            with pytest.raises(ConversationError) as error:
                await ConversationRepository(pool, tenant, user).begin_run(cid, '', attachment_ids=ids)
            assert error.value.status_code == status
            assert await pool.fetchval('SELECT count(*) FROM chat_messages') == before
            assert await pool.fetchval('SELECT count(*) FROM chat_response_runs') == 0
    asyncio.run(scenario())


# Dado uma corrida de envio, quando ambos usam o mesmo anexo, então só um vínculo vence.
def test_concurrent_association_and_wrong_conversation_owner():
    from attachment_repository import ConversationError
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            aid = await attach(pool, tenant, user, cid)
            for owner in ((tenant, uuid4()), (uuid4(), user)):
                with pytest.raises(ConversationError) as error:
                    await ConversationRepository(pool, *owner).begin_run(cid, 'invasão', attachment_ids=[aid])
                assert error.value.status_code == 404
            repo = ConversationRepository(pool, tenant, user)
            outcomes = await asyncio.gather(*(repo.begin_run(cid, '', attachment_ids=[aid]) for _ in range(2)), return_exceptions=True)
            assert sum(isinstance(value, tuple) for value in outcomes) == 1
            assert next(value for value in outcomes if isinstance(value, ConversationError)).status_code == 409
            assert await pool.fetchval('SELECT count(*) FROM chat_messages') == 1
    asyncio.run(scenario())


# Dado histórico próprio, quando consulta metadados, então não revela storage nem outro dono.
def test_metadata_is_scoped_and_private():
    from attachment_repository import AttachmentRepository
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            aid = await attach(pool, tenant, user, cid)
            _, _, mid = await ConversationRepository(pool, tenant, user).begin_run(cid, '', attachment_ids=[aid])
            await pool.execute("UPDATE chat_attachments SET metadata=$1::jsonb WHERE id=$2", '{"pageCount":2,"private":"secret"}', aid)
            repo = AttachmentRepository(pool, tenant, user)
            metadata = await repo.by_message(cid)
            assert metadata == {str(mid): [{'id': str(aid), 'filename':'grafico.png', 'mimeType':'image/png', 'sizeBytes':1024, 'pageCount':2}]}
            assert await AttachmentRepository(pool, tenant, uuid4()).by_message(cid) == {}
            assert await repo.by_message(uuid4()) == {}
    asyncio.run(scenario())
