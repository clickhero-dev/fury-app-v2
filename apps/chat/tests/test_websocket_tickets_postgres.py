"""Atomic ticket consumption on independent connections, against PostgreSQL."""
import asyncio
import os
import time
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import asyncpg
import pytest

from websocket_transport import consume_ticket, issue_ticket, ticket_hash


URL = os.getenv('CHAT_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='CHAT_TEST_DATABASE_URL ausente')


def test_migration_is_registered_for_fresh_and_existing_installations():
    runner = (Path(__file__).resolve().parents[3] / 'packages/db/src/migrate.ts').read_text()
    assert "{ tag: '0085_chat_websocket_tickets' }" in runner


def test_ticket_atomic_consumption_and_expiration():
    async def run():
        schema = 'ws_test_' + uuid4().hex
        admin = await asyncpg.connect(URL)
        await admin.execute(f'CREATE SCHEMA "{schema}"')
        pool = None
        try:
            pool = await asyncpg.create_pool(URL, min_size=2, max_size=2,
                                             server_settings={'search_path': schema})
            sql = (Path(__file__).resolve().parents[3] / 'packages/db/migrations/0085_chat_websocket_tickets.sql').read_text()
            await pool.execute(sql)
            # Existing installations can safely apply the migration repeatedly.
            await pool.execute(sql)
            secret = 'test-secret-with-at-least-32-characters'
            now = int(time.time())
            user = {'userId': uuid4(), 'tenantId': uuid4(), 'email': 'u@example.invalid',
                    'role': 'admin', 'actor': 'chatbot', 'iat': now, 'exp': now + 300}
            ticket = await issue_ticket(pool, user, secret)
            results = await asyncio.gather(consume_ticket(pool, ticket, secret), consume_ticket(pool, ticket, secret))
            assert sum(value is not None for value in results) == 1
            expired = await issue_ticket(pool, {**user, 'exp': 1}, secret)
            assert await consume_ticket(pool, expired, secret) is None
            await issue_ticket(pool, user, secret)
            assert not await pool.fetchval('SELECT EXISTS(SELECT 1 FROM chat_websocket_tickets WHERE ticket_hash=$1)', ticket_hash(expired))
        finally:
            if pool:
                await pool.close()
            await admin.execute(f'DROP SCHEMA "{schema}" CASCADE')
            await admin.close()
    asyncio.run(run())


def test_migration_runner_on_fresh_and_upgrade_database():
    parts = urlsplit(URL)
    if parts.hostname != '127.0.0.1' or not parts.path.endswith('_isolated') or parts.query:
        pytest.fail('CHAT_TEST_DATABASE_URL deve apontar para PostgreSQL descartável em 127.0.0.1/*_isolated')
    root = Path(__file__).resolve().parents[3]
    tsx = root / 'node_modules/.bin/tsx'
    if not tsx.exists():
        pytest.skip('tsx não instalado')

    async def run():
        name = 'ws_migration_' + uuid4().hex + '_isolated'
        admin = await asyncpg.connect(URL)
        await admin.execute(f'CREATE DATABASE "{name}"')
        target = urlunsplit((parts.scheme, parts.netloc, '/' + name, '', ''))
        env = {**os.environ, 'DATABASE_URL': target, 'NODE_ENV': 'development'}

        def migrate():
            subprocess.run([str(tsx), str(root / 'packages/db/src/migrate.ts')],
                           cwd=root, env=env, check=True, capture_output=True, timeout=90)
        try:
            migrate()
            conn = await asyncpg.connect(target)
            try:
                assert await conn.fetchval("SELECT to_regclass('chat_websocket_tickets') IS NOT NULL")
                assert await conn.fetchval("SELECT count(*) FROM __drizzle_migrations WHERE hash='0085_chat_websocket_tickets'") == 1
                # Simulate an existing installation immediately before 0085.
                await conn.execute("DROP TABLE chat_websocket_tickets; DELETE FROM __drizzle_migrations WHERE hash='0085_chat_websocket_tickets'")
            finally:
                await conn.close()
            migrate()
            conn = await asyncpg.connect(target)
            try:
                assert await conn.fetchval("SELECT to_regclass('chat_websocket_tickets') IS NOT NULL")
                assert await conn.fetchval("SELECT count(*) FROM __drizzle_migrations WHERE hash='0085_chat_websocket_tickets'") == 1
            finally:
                await conn.close()
        finally:
            await admin.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
            await admin.close()
    asyncio.run(run())
