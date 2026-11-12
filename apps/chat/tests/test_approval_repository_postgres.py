"""Funcionalidade: persistência real de recusas sem sobrescrever outro resultado
Cenário: preservar isolamento e resultados já observados
Dado uma aprovação no PostgreSQL isolado
Quando registra recusa vinculada ao ator
Então somente estados compatíveis recebem a causa segura
Cenário: finish Node e Python disputam o mesmo registro
Dado conclusão ou falha concorrente
Quando a escrita Python aguarda o lock
Então respeita a transição vencedora e preserva resultados conclusivos
"""
import asyncio
import json
import os
from uuid import uuid4

import asyncpg
import pytest

from action_outcomes import ActionOutcomes
from approval_repository import ApprovalRepository, LEGACY_FAILURE

URL = os.getenv('CHAT_OUTCOME_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='CHAT_OUTCOME_TEST_DATABASE_URL isolada ausente')
RESULT = {'code': 'VIDEO_NOT_IN_PLAN', 'error': 'A criação de vídeos não está disponível no seu plano atual.'}
TABLE = 'CREATE TEMP TABLE chat_approvals(id uuid PRIMARY KEY, tenant_id uuid,user_id uuid,status text,result jsonb)'


@pytest.mark.parametrize('status,result,allowed', [
    ('approved', None, True), ('executing', None, True), ('failed', None, True),
    ('failed', LEGACY_FAILURE, True), ('failed', RESULT, True),
    ('completed', None, False), ('completed', {'jobId': 'existing'}, False),
    ('unknown', None, False), ('pending', None, False), ('expired', None, False),
    ('failed', {'error': 'unrecognized'}, False),
    ('failed', {'code': 'SERVICE_BLOCKED', 'error': 'Esta ação não está disponível para sua conta.'}, False),
    ('executing', {'jobId': 'existing'}, False), ('approved', {'unrecognized': True}, False),
])
def test_only_expected_empty_states_or_node_failure_can_be_enriched(status, result, allowed):
    async def run():
        conn = await asyncpg.connect(URL)
        approval, tenant, user = uuid4(), uuid4(), uuid4()
        try:
            await conn.execute(TABLE)
            await conn.execute('INSERT INTO chat_approvals VALUES($1,$2,$3,$4,$5::jsonb)', approval, tenant, user, status, json.dumps(result) if result is not None else None)
            assert await ApprovalRepository(conn, tenant, user).record_failure(approval, RESULT) is allowed
            row = await conn.fetchrow('SELECT status,result FROM chat_approvals WHERE id=$1', approval)
            assert row['status'] == ('failed' if allowed else status)
            assert (json.loads(row['result']) if row['result'] else None) == (RESULT if allowed else result)
        finally:
            await conn.close()
    asyncio.run(run())


@pytest.mark.parametrize('wrong', ['tenant', 'user', 'id'])
def test_failure_write_is_actor_and_approval_bound(wrong):
    async def run():
        conn = await asyncpg.connect(URL)
        approval, tenant, user = uuid4(), uuid4(), uuid4()
        try:
            await conn.execute(TABLE)
            await conn.execute("INSERT INTO chat_approvals VALUES($1,$2,$3,'executing',NULL)", approval, tenant, user)
            repo = ApprovalRepository(conn, uuid4() if wrong == 'tenant' else tenant, uuid4() if wrong == 'user' else user)
            assert not await repo.record_failure(uuid4() if wrong == 'id' else approval, RESULT)
            assert await conn.fetchval('SELECT status FROM chat_approvals') == 'executing'
            assert await conn.fetchval('SELECT result FROM chat_approvals') is None
        finally:
            await conn.close()
    asyncio.run(run())


def test_node_finish_after_python_cannot_replace_safe_failure():
    async def run():
        conn = await asyncpg.connect(URL)
        approval, tenant, user = uuid4(), uuid4(), uuid4()
        try:
            await conn.execute(TABLE)
            await conn.execute("INSERT INTO chat_approvals VALUES($1,$2,$3,'executing',NULL)", approval, tenant, user)
            refusal = await ActionOutcomes(ApprovalRepository(conn, tenant, user)).record_refusal(approval, 403, {'error': {'code': 'VIDEO_NOT_IN_PLAN', 'message': 'private'}})
            assert refusal is not None
            assert refusal.result() == RESULT
            # Match the Node repository's actor scope and executing-only guard.
            await conn.execute("UPDATE chat_approvals SET status='failed',result=$1::jsonb WHERE id=$2 AND tenant_id=$3 AND user_id=$4 AND status='executing'", json.dumps(LEGACY_FAILURE), approval, tenant, user)
            assert json.loads(await conn.fetchval('SELECT result FROM chat_approvals')) == RESULT
        finally:
            await conn.close()
    asyncio.run(run())


@pytest.mark.parametrize('winner', ['failed', 'completed'])
def test_waiting_writer_rechecks_the_winning_status(winner):
    async def run():
        schema = 'chat_outcome_' + uuid4().hex
        admin = await asyncpg.connect(URL)
        pool = None
        approval, tenant, user = uuid4(), uuid4(), uuid4()
        try:
            await admin.execute('CREATE SCHEMA ' + schema)
            await admin.execute('CREATE TABLE ' + schema + '.chat_approvals(id uuid PRIMARY KEY,tenant_id uuid,user_id uuid,status text,result jsonb)')
            await admin.execute('INSERT INTO ' + schema + ".chat_approvals VALUES($1,$2,$3,'executing',NULL)", approval, tenant, user)
            pool = await asyncpg.create_pool(URL, min_size=2, max_size=2, server_settings={'search_path': schema})
            async with pool.acquire() as node:
                async with node.transaction():
                    await node.fetchval('SELECT id FROM chat_approvals WHERE id=$1 FOR UPDATE', approval)
                    writing = asyncio.create_task(ApprovalRepository(pool, tenant, user).record_failure(approval, RESULT))
                    await asyncio.sleep(0.05)
                    assert not writing.done()
                    await node.execute('UPDATE chat_approvals SET status=$1,result=$2::jsonb WHERE id=$3', winner, json.dumps(LEGACY_FAILURE if winner == 'failed' else {'jobId': 'existing'}), approval)
                assert await asyncio.wait_for(writing, 2) is (winner == 'failed')
            row = await admin.fetchrow('SELECT status,result FROM ' + schema + '.chat_approvals')
            assert row['status'] == winner
            assert json.loads(row['result']) == (RESULT if winner == 'failed' else {'jobId': 'existing'})
        finally:
            if pool:
                await pool.close()
            await admin.execute('DROP SCHEMA ' + schema + ' CASCADE')
            await admin.close()
    asyncio.run(run())
