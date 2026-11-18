"""Python -> real Node controller/repository -> disposable shared PostgreSQL."""
import asyncio
import json
import os
from pathlib import Path

import httpx
import pytest

from chat_read_tools import ChatReadTools
from conversation_repository import ConversationRepository
from guided_setup_persistence import GuidedSetupPersistence
from test_attachments_postgres import URL, database
from test_guided_setup_cross_service import SECRET, token

ROOT = Path(__file__).resolve().parents[3]
pytestmark = pytest.mark.skipif(not URL, reason='isolated PostgreSQL required')


@pytest.mark.parametrize('restart_before_send,edited_before_offering', [
    (False, False), (True, False), (False, True),
])
def test_lost_response_replays_once_and_never_overwrites_later_edit(restart_before_send, edited_before_offering):
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            await pool.execute('''ALTER TABLE tenants ADD COLUMN name text, ADD COLUMN slug text,
                ADD COLUMN business_context text, ADD COLUMN deleted_at timestamptz;
                ALTER TABLE users ADD COLUMN tenant_id uuid, ADD COLUMN name text, ADD COLUMN deleted_at timestamptz''')
            await pool.execute("UPDATE tenants SET name='Antes',slug='antes' WHERE id=$1", tenant)
            await pool.execute("UPDATE users SET tenant_id=$1,name='Ana' WHERE id=$2", tenant, user)
            migrations = ROOT / 'packages/db/migrations'
            for name in ('0084_chat_guided_setups.sql', '0085_chat_guided_setup_receipts.sql',
                         '0086_chat_guided_profile_effects.sql', '0087_chat_guided_name_versions.sql'):
                await pool.execute((migrations / name).read_text())
            await pool.execute('''INSERT INTO chat_guided_setups(tenant_id,user_id,step,answers)
                VALUES($1,$2,'business_name','{}'::jsonb)''', tenant, user)
            name_run, name_lease, name_mid = await ConversationRepository(pool, tenant, user).begin_run(cid, 'Loja')
            name_setup = GuidedSetupPersistence(pool, tenant, user, cid, name_run, name_lease, name_mid)
            await name_setup.capture_snapshot()
            await name_setup.save_answer('Loja')
            await pool.execute("UPDATE chat_response_runs SET status='completed' WHERE id=$1", name_run)
            await pool.execute("UPDATE chat_guided_setups SET step='offering' WHERE tenant_id=$1 AND user_id=$2", tenant, user)
            if edited_before_offering:
                await pool.execute("UPDATE tenants SET name='Editado antes da oferta' WHERE id=$1", tenant)
            run, lease, mid = await ConversationRepository(pool, tenant, user).begin_run(cid, 'Café')
            setup = GuidedSetupPersistence(pool, tenant, user, cid, run, lease, mid)
            await setup.capture_snapshot()
            await setup.save_answer('Café')
            if restart_before_send:
                await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", run)
                run, lease, retried_mid = await ConversationRepository(pool, tenant, user).begin_run(cid, retry=True)
                assert retried_mid == mid
            schema = await pool.fetchval('SELECT current_schema()')
            env = {'PATH': os.environ['PATH'], 'HOME': os.environ['HOME'], 'NODE_ENV': 'test',
                   'DATABASE_URL': URL, 'TEST_DATABASE_URL': URL, 'CHAT_MEDIA_TEST_DATABASE_URL': URL,
                   'CHAT_CROSS_SERVICE_SCHEMA': schema, 'CHAT_DELEGATION_SECRET': SECRET,
                   'JWT_SECRET': 'synthetic-jwt-secret-at-least-32-characters',
                   'JWT_REFRESH_SECRET': 'synthetic-refresh-secret-at-least-32-characters',
                   'TOKEN_ENCRYPTION_KEY': '1' * 64, 'DOTENV_CONFIG_PATH': '/dev/null'}
            process = await asyncio.create_subprocess_exec(
                str(ROOT / 'node_modules/.bin/tsx'), 'apps/api/src/__tests__/guided-profile-real-server.ts',
                cwd=ROOT, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            try:
                line = await asyncio.wait_for(process.stdout.readline(), 20)
                assert line, 'Node integration server failed to start'
                base = 'http://127.0.0.1:' + str(json.loads(line)['port'])
                calls = []
                async with httpx.AsyncClient() as real:
                    async def lose_first_response(request):
                        response = await real.send(request)
                        calls.append(response.status_code)
                        if len(calls) == 1:
                            raise httpx.ReadTimeout('synthetic lost response', request=request)
                        return response
                    async with httpx.AsyncClient(transport=httpx.MockTransport(lose_first_response)) as proxy:
                        client = ChatReadTools(base, token(tenant, user), proxy, conversation_id=str(cid),
                                               run_id=str(run), lease_id=str(lease))
                        saved = await client.save_guided_business_context('Loja', 'Produtos ou serviços: Café')
                        if edited_before_offering:
                            assert 'error' in saved
                            assert calls == [409, 409]
                            assert await pool.fetchval('SELECT count(*) FROM chat_guided_profile_effects') == 0
                            assert await pool.fetchval('SELECT name FROM tenants WHERE id=$1', tenant) == 'Editado antes da oferta'
                            return
                        assert saved['tenantName'] == 'Loja'
                        assert calls == [200, 200]
                        assert await pool.fetchval('SELECT count(*) FROM chat_guided_profile_effects') == 1
                        await pool.execute("UPDATE tenants SET name='Editado' WHERE id=$1", tenant)
                        conflict = await client.save_guided_business_context('Loja', 'Produtos ou serviços: Café')
                        assert 'error' in conflict
                        assert await pool.fetchval('SELECT name FROM tenants WHERE id=$1', tenant) == 'Editado'
            finally:
                if process.returncode is None:
                    process.terminate()
                await asyncio.wait_for(process.wait(), 10)
    asyncio.run(scenario())
