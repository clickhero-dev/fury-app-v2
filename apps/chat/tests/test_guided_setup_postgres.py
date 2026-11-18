"""Guided setup uses asyncpg's real JSONB wire format."""
import asyncio
from pathlib import Path

import pytest

from guided_setup import BUSINESS_NAME, DECLINED, LOGO, GuidedSetup, GuidedSetupTools
from test_attachments_postgres import URL, database

pytestmark = pytest.mark.skipif(not URL, reason='isolated PostgreSQL required')


def test_resume_after_first_answer_and_decline_on_real_postgres():
    async def scenario():
        async with database() as (pool, tenant, user, _):
            migration = Path(__file__).resolve().parents[3] / 'packages/db/migrations/0084_chat_guided_setups.sql'
            await pool.execute(migration.read_text())
            setup = GuidedSetup(pool, tenant, user)
            assert (await setup.save_answer('Sim'))['step'] == BUSINESS_NAME
            resumed = GuidedSetup(pool, tenant, user)
            assert (await resumed.save_answer('Loja'))['step'] == LOGO
            assert (await resumed.current()).answers == {'businessName': 'Loja'}
            await pool.execute('DELETE FROM chat_guided_setups WHERE tenant_id=$1 AND user_id=$2', tenant, user)
            result = await GuidedSetupTools(resumed).guided_setup_answer('Não')
            assert result['step'] == DECLINED
            assert (await resumed.current()).step == DECLINED
    asyncio.run(scenario())
