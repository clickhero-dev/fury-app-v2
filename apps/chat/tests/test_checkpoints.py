"""Durable checkpoints are bounded, secret-free, fenced and versioned."""
import asyncio
import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from checkpoints import (
    CACHE_MISS, CheckpointIncompatible, CheckpointRepository, MAX_CONTEXT_BYTES,
)
from runs import RunExpired


class Connection:
    def __init__(self):
        self.fetchval = AsyncMock(return_value=1)
        self.fetchrow = AsyncMock(return_value=None)
        self.execute = AsyncMock()

    @asynccontextmanager
    async def transaction(self):
        yield


class Pool:
    def __init__(self):
        self.connection = Connection()

    @asynccontextmanager
    async def acquire(self):
        yield self.connection


def repository(pool=None, **kwargs):
    return CheckpointRepository(pool or Pool(), *(uuid4() for _ in range(6)), **kwargs)


def test_load_miss_and_json_roundtrip():
    async def scenario():
        repo = repository()
        assert await repo.load_context() is None
        repo.pool.connection.fetchrow.return_value = {
            'schema_version': 1, 'policy_version': '1',
            'context': json.dumps(['policy', {'role': 'user', 'content': 'Olá'}]),
            'history': json.dumps([{'role': 'user', 'content': 'Olá'}]),
        }
        assert await repo.load_context() == (
            ['policy', {'role': 'user', 'content': 'Olá'}],
            [{'role': 'user', 'content': 'Olá'}],
        )
    asyncio.run(scenario())


@pytest.mark.parametrize('context,history', [
    ({}, []), ([], {}), ([float('nan')], []),
    (['á' * MAX_CONTEXT_BYTES], []),
    ([{'access_token': 'secret'}], []),
    (['Bearer abc.def.ghi'], []),
    ([{'password': 'secret'}], []),
])
def test_bad_or_secret_context_never_reaches_database(context, history):
    repo = repository()
    with pytest.raises(ValueError):
        asyncio.run(repo.save_context(context, history))
    repo.pool.connection.execute.assert_not_called()


@pytest.mark.parametrize('method,args', [
    ('load_context', ()), ('save_context', ([], [])),
    ('record_tool', ('brand', {}, {'data': {}})),
    ('cached_tool', ('brand', {})),
])
def test_all_operations_fail_closed_when_owner_or_lease_invalid(method, args):
    repo = repository()
    repo.pool.connection.fetchval.return_value = None
    with pytest.raises(RunExpired):
        asyncio.run(getattr(repo, method)(*args))
    repo.pool.connection.execute.assert_not_called()
    repo.pool.connection.fetchrow.assert_not_called()


def test_database_failure_is_not_a_cache_miss():
    repo = repository()
    repo.pool.connection.fetchval.side_effect = RuntimeError('unavailable')
    with pytest.raises(RuntimeError, match='unavailable'):
        asyncio.run(repo.load_context())


@pytest.mark.parametrize('version,policy', [(2, '1'), (1, 'old')])
def test_incompatible_context_never_silently_rebuilds(version, policy):
    repo = repository()
    repo.pool.connection.fetchrow.return_value = {
        'schema_version': version, 'policy_version': policy, 'context': '[]', 'history': '[]',
    }
    with pytest.raises(CheckpointIncompatible):
        asyncio.run(repo.load_context())


@pytest.mark.parametrize('name,args,result', [
    ('propose_image', {}, {}), ('_get', {}, {}),
    ('brand', {'token': 'secret'}, {}),
    ('calendar', {'start_date': '2026-01-01', 'authorization': 'secret'}, {}),
    ('brand', {}, {'error': 'network failure'}),
    ('brand', {}, {'success': False}),
    ('brand', {}, {'data': {'accessToken': 'secret'}}),
    ('brand', {}, {'data': ['Bearer abc.def.ghi']}),
    ('brand', {}, {'data': float('inf')}),
])
def test_mutations_errors_and_secrets_are_not_checkpointable(name, args, result):
    repo = repository()
    with pytest.raises(ValueError):
        asyncio.run(repo.record_tool(name, args, result))
    repo.pool.connection.execute.assert_not_called()


def test_cached_null_is_distinct_from_miss_and_canonical_arguments():
    async def scenario():
        repo = repository()
        assert await repo.cached_tool('calendar', {'end_date': 'b', 'start_date': 'a'}) is CACHE_MISS
        repo.pool.connection.fetchrow.return_value = {'result': 'null', 'schema_version': 1, 'policy_version': '1'}
        assert await repo.cached_tool('calendar', {'start_date': 'a', 'end_date': 'b'}) is None
        first = repo.pool.connection.fetchrow.call_args_list[0].args
        second = repo.pool.connection.fetchrow.call_args_list[1].args
        assert first == second
    asyncio.run(scenario())


def test_snapshot_and_tool_writes_are_first_write_wins():
    async def scenario():
        repo = repository()
        await repo.save_context(['policy'], [])
        query = repo.pool.connection.execute.call_args.args[0]
        assert 'ON CONFLICT' in query and 'DO NOTHING' in query
        await repo.record_tool('brand', {}, None)
        query = repo.pool.connection.execute.call_args.args[0]
        assert 'ON CONFLICT' in query and 'DO NOTHING' in query
    asyncio.run(scenario())


@pytest.mark.parametrize('policy', ['', None, 1, 'v' * 129])
def test_policy_version_must_be_explicit_bounded_string(policy):
    with pytest.raises(ValueError):
        repository(policy_version=policy)


@pytest.mark.parametrize('context', [
    [{1: 'bad key'}], [object()],
])
def test_non_json_context_is_rejected(context):
    with pytest.raises(ValueError):
        asyncio.run(repository().save_context(context, []))


def test_deep_context_is_rejected():
    context = []
    for _ in range(66):
        context = [context]
    with pytest.raises(ValueError):
        asyncio.run(repository().save_context(context, []))


def test_custom_json_codec_is_supported_but_bad_context_shape_is_not():
    async def scenario():
        repo = repository()
        repo.pool.connection.fetchrow.return_value = {
            'schema_version': 1, 'policy_version': '1', 'context': [], 'history': [],
        }
        assert await repo.load_context() == ([], [])
        repo.pool.connection.fetchrow.return_value['history'] = {}
        with pytest.raises(CheckpointIncompatible):
            await repo.load_context()
    asyncio.run(scenario())


def test_record_requires_context_and_refuses_incompatible_first_snapshot():
    async def scenario():
        repo = repository()
        repo.pool.connection.execute.return_value = 'INSERT 0 0'
        with pytest.raises(CheckpointIncompatible):
            await repo.record_tool('brand', {}, {})
        repo.pool.connection.fetchrow.return_value = {'schema_version': 1, 'policy_version': 'old'}
        with pytest.raises(CheckpointIncompatible):
            await repo.record_tool('brand', {}, {})
        with pytest.raises(CheckpointIncompatible):
            await repo.save_context([], [])
    asyncio.run(scenario())
