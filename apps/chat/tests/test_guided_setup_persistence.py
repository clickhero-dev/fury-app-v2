import asyncio
import json
from contextlib import asynccontextmanager
from uuid import uuid4

import pytest

from guided_setup_persistence import GuidedSetupPersistence
from runs import RunExpired


class Connection:
    def __init__(self):
        self.valid = True
        self.state = None
        self.receipts = {}
        self.snapshots = {}
        self.writes = 0

    @asynccontextmanager
    async def transaction(self):
        yield

    async def fetchval(self, sql, *args):
        if 'EXISTS' in sql:
            return False
        if 'chat_conversations' in sql:
            return args[0] if self.valid else None
        if 'status=' in sql:
            return 1 if self.valid else None
        return 1

    async def fetchrow(self, sql, *args):
        if 'chat_guided_setup_snapshots' in sql:
            return self.snapshots.get(args[1])
        if 'chat_guided_setup_receipts' in sql:
            return self.receipts.get(args[1])
        if 'chat_guided_setups' in sql:
            return self.state
        if 'FROM users u JOIN tenants t' in sql:
            return {'userVersion': '1', 'tenantVersion': '2'}
        raise AssertionError(sql)

    async def execute(self, sql, *args):
        if 'INSERT INTO chat_guided_setups' in sql:
            if self.state is None:
                self.state = {'step': 'invitation', 'answers': '{}'}
        elif 'UPDATE chat_guided_setups' in sql:
            self.state = {'step': args[2], 'answers': args[3]}
            self.writes += 1
        elif 'INSERT INTO chat_guided_setup_receipts' in sql:
            self.receipts[args[1]] = {'result': args[2]}
        elif 'INSERT INTO chat_guided_setup_snapshots' in sql:
            self.snapshots.setdefault(args[1], {'step': args[2], 'answers': args[3],
                                                'profile_user_version': args[4], 'profile_tenant_version': args[5]})
        else:
            raise AssertionError(sql)


class Pool:
    def __init__(self):
        self.conn = Connection()

    @asynccontextmanager
    async def acquire(self):
        yield self.conn


def repo(pool, message=None):
    return GuidedSetupPersistence(pool, *[uuid4() for _ in range(5)], message or uuid4())


def test_retry_same_message_never_advances_or_authorizes_external_work_twice():
    async def scenario():
        pool = Pool()
        setup = repo(pool)
        await setup.capture_snapshot()
        first = await setup.save_answer('Sim')
        replay = await setup.save_answer(None)
        assert first['step'] == 'business_name'
        assert first['replayed'] is False
        assert replay == {**first, 'replayed': True}
        assert pool.conn.writes == 1
    asyncio.run(scenario())


def test_next_message_advances_and_invalid_answer_is_not_recorded():
    async def scenario():
        pool = Pool()
        first = repo(pool)
        await first.capture_snapshot()
        with pytest.raises(ValueError):
            await first.save_answer('maybe')
        assert not pool.conn.receipts
        await first.save_answer('Sim')
        second = repo(pool)
        await second.capture_snapshot()
        result = await second.save_answer('Loja')
        assert result['step'] == 'logo'
        assert result['answers'] == {'businessName': 'Loja'}
    asyncio.run(scenario())


def test_expired_run_cannot_read_or_replay_or_write():
    async def scenario():
        pool = Pool()
        setup = repo(pool)
        await setup.capture_snapshot()
        await setup.save_answer('Sim')
        pool.conn.valid = False
        with pytest.raises(RunExpired):
            await setup.save_answer('Sim')
        with pytest.raises(RunExpired):
            await setup.current()
    asyncio.run(scenario())


def test_invalid_input_rejected():
    async def scenario():
        setup = repo(Pool())
        await setup.capture_snapshot()
        for answer in (None, 123, '', 'x' * 5001):
            with pytest.raises(ValueError):
                await setup.save_answer(answer)
    asyncio.run(scenario())


def test_profile_update_is_replayed_without_an_external_effect_claim():
    async def scenario():
        pool = Pool()
        pool.conn.state = {'step': 'offering', 'answers': json.dumps({'businessName': 'Loja'})}
        setup = repo(pool)
        await setup.capture_snapshot()
        first = await setup.save_answer('Café')
        assert first['profileUpdate'] == {
            'tenantName': 'Loja', 'businessContext': 'Produtos ou serviços: Café'
        }
        assert first['replayed'] is False
        assert (await setup.save_answer('Café'))['replayed'] is True
        next_turn = repo(pool)
        await next_turn.capture_snapshot()
        assert 'profileUpdate' not in await next_turn.save_answer('Pular')
    asyncio.run(scenario())


def test_pending_profile_update_can_be_reconciled_without_invoking_model():
    async def scenario():
        pool = Pool()
        pool.conn.state = {'step': 'offering', 'answers': json.dumps({'businessName': 'Loja'})}
        setup = repo(pool)
        await setup.capture_snapshot()
        assert await setup.pending_profile_update() is None
        await setup.save_answer('Café')
        assert await setup.pending_profile_update() == {
            'tenantName': 'Loja', 'businessContext': 'Produtos ou serviços: Café',
        }
        pool.conn.valid = False
        with pytest.raises(RunExpired):
            await setup.pending_profile_update()
    asyncio.run(scenario())


def test_old_offering_snapshot_without_versions_cannot_update_profile():
    from guided_setup_persistence import SnapshotMissing

    async def scenario():
        pool = Pool()
        pool.conn.state = {'step': 'offering', 'answers': json.dumps({'businessName': 'Loja'})}
        setup = repo(pool)
        await setup.capture_snapshot()
        snapshot = next(iter(pool.conn.snapshots.values()))
        snapshot['profile_user_version'] = None
        with pytest.raises(SnapshotMissing):
            await setup.save_answer('Café')
        assert not pool.conn.receipts
        assert pool.conn.writes == 0
    asyncio.run(scenario())
