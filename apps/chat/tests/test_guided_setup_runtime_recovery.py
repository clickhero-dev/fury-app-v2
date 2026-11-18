"""Wiring do chat com persistência real e agente controlado.

Execute com CHAT_MEDIA_TEST_DATABASE_URL apontando para um banco isolado,
conforme a validação da fixture compartilhada de PostgreSQL.
"""
import asyncio
import os
from pathlib import Path
from types import SimpleNamespace

import agno.agent
import httpx
import pytest

import app as chat
from guided_setup import BUSINESS_NAME, INVITATION, question_for
from test_attachments_postgres import database


pytestmark = pytest.mark.skipif(
    not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'),
    reason='CHAT_MEDIA_TEST_DATABASE_URL isolado ausente',
)
MIGRATIONS = Path(__file__).resolve().parents[3] / 'packages/db/migrations'


async def install_guided_migrations(pool):
    for name in ('0084_chat_guided_setups.sql', '0085_chat_guided_setup_receipts.sql'):
        await pool.execute((MIGRATIONS / name).read_text())


def configure_runtime(monkeypatch, tenant, user, calls, *, fail_first=False, tool_answer='Sim'):
    class Agent:
        def __init__(self, **options):
            self.options = options

        def arun(self, messages, **kwargs):
            async def events():
                tools = {getattr(tool, '__name__', ''): tool for tool in self.options['tools']}
                calls.append({'tools': tools, 'instructions': self.options['instructions']})
                if 'guided_setup_answer' in tools:
                    result = await self.options['tool_hooks'][0](
                        tools['guided_setup_answer'], {'answer': tool_answer},
                        function_name='guided_setup_answer',
                    )
                    calls[-1]['result'] = result
                if fail_first and len(calls) == 1:
                    raise httpx.ReadError('synthetic provider failure')
                yield SimpleNamespace(content='Resposta concluída.')
            return events()

    async def noop(*args, **kwargs):
        return False

    monkeypatch.setenv('MODEL_CHATBOT', 'synthetic/model')
    monkeypatch.setenv('OPENROUTER_API_KEY', 'synthetic')
    monkeypatch.setenv('ADY_API_URL', 'https://ady.invalid')
    monkeypatch.setenv('POSTHOG_API_KEY', '')
    monkeypatch.setenv('DATABASE_URL', os.environ['CHAT_MEDIA_TEST_DATABASE_URL'])
    monkeypatch.setattr(agno.agent, 'Agent', Agent)
    monkeypatch.setattr(chat, 'consolidate', noop)
    monkeypatch.setattr(chat, 'generate_title', noop)
    application = chat.create_app()
    application.dependency_overrides[chat.identity] = lambda: {'tenantId': tenant, 'userId': user}
    return application


async def seed_question(pool, cid, question):
    await pool.execute(
        "INSERT INTO chat_messages(conversation_id,role,content) VALUES($1,'assistant',$2)",
        cid, question,
    )


@pytest.mark.parametrize('shown,authorized', [
    (question_for(INVITATION)['question'], True),
    (question_for(BUSINESS_NAME)['question'], False),
    ('Você quer ajuda com uma campanha?', False),
])
def test_only_current_guided_question_authorizes_answer(monkeypatch, shown, authorized):
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            await install_guided_migrations(pool)
            await seed_question(pool, cid, shown)
            calls = []
            application = configure_runtime(monkeypatch, tenant, user, calls)
            async with application.router.lifespan_context(application):
                application.state.pool = pool
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=application),
                    base_url='http://chat', headers={'authorization': 'Bearer synthetic'},
                ) as client:
                    response = await client.post(f'/conversations/{cid}/messages', json={'content': 'Sim'})
                application.state.pool = None
            assert 'event: done' in response.text
            assert len(calls) == 1
            assert ('guided_setup_answer' in calls[0]['tools']) is authorized
            assert 'guided_setup_status' in calls[0]['tools']
            assert await pool.fetchval('SELECT step FROM chat_guided_setups') == (
                BUSINESS_NAME if authorized else INVITATION
            )
            assert await pool.fetchval('SELECT count(*) FROM chat_guided_setup_receipts') == int(authorized)

    asyncio.run(scenario())


def test_retry_after_provider_failure_does_not_advance_twice(monkeypatch):
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            await install_guided_migrations(pool)
            await seed_question(pool, cid, question_for(INVITATION)['question'])
            calls = []
            application = configure_runtime(monkeypatch, tenant, user, calls, fail_first=True)
            async with application.router.lifespan_context(application):
                application.state.pool = pool
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=application),
                    base_url='http://chat', headers={'authorization': 'Bearer synthetic'},
                ) as client:
                    failed = await client.post(f'/conversations/{cid}/messages', json={'content': 'Sim'})
                    assert 'event: error' in failed.text
                    assert 'event: done' not in failed.text
                    first = await pool.fetchrow('SELECT * FROM chat_response_runs WHERE conversation_id=$1', cid)
                    assert first['status'] == 'failed'
                    resumed = await client.post(f'/conversations/{cid}/retry?run_id={first["id"]}')
                    assert 'event: done' in resumed.text
                    assert 'event: error' not in resumed.text
                application.state.pool = None
            assert len(calls) == 2
            assert all('guided_setup_answer' in call['tools'] for call in calls)
            assert await pool.fetchval('SELECT step FROM chat_guided_setups') == BUSINESS_NAME
            assert await pool.fetchval('SELECT count(*) FROM chat_guided_setup_receipts') == 1
            assert await pool.fetchval(
                "SELECT count(*) FROM chat_messages WHERE conversation_id=$1 AND role='user'", cid
            ) == 1
            assert await pool.fetchval(
                'SELECT count(DISTINCT user_message_id) FROM chat_response_runs WHERE conversation_id=$1', cid
            ) == 1

    asyncio.run(scenario())


def test_model_cannot_replace_the_users_confirmed_answer(monkeypatch):
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            await install_guided_migrations(pool)
            await seed_question(pool, cid, question_for(INVITATION)['question'])
            calls = []
            application = configure_runtime(monkeypatch, tenant, user, calls, tool_answer='Não')
            async with application.router.lifespan_context(application):
                application.state.pool = pool
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=application), base_url='http://chat',
                    headers={'authorization': 'Bearer synthetic'},
                ) as client:
                    await client.post(f'/conversations/{cid}/messages', json={'content': 'Sim'})
                application.state.pool = None
            assert calls[0]['result']['error']
            assert await pool.fetchval('SELECT step FROM chat_guided_setups') == INVITATION
            assert await pool.fetchval('SELECT count(*) FROM chat_guided_setup_receipts') == 0
    asyncio.run(scenario())


def test_missing_guided_migrations_do_not_block_chat(monkeypatch):
    async def scenario():
        async with database() as (pool, tenant, user, cid):
            await seed_question(pool, cid, question_for(INVITATION)['question'])
            calls = []
            application = configure_runtime(monkeypatch, tenant, user, calls)
            async with application.router.lifespan_context(application):
                application.state.pool = pool
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=application),
                    base_url='http://chat', headers={'authorization': 'Bearer synthetic'},
                ) as client:
                    response = await client.post(f'/conversations/{cid}/messages', json={'content': 'Sim'})
                application.state.pool = None
            assert 'event: done' in response.text
            assert 'event: error' not in response.text
            assert len(calls) == 1
            assert 'guided_setup_status' in calls[0]['tools']
            assert 'guided_setup_answer' not in calls[0]['tools']
            assert any('indisponível neste turno' in text for text in calls[0]['instructions'])
            assert await pool.fetchval("SELECT to_regclass('chat_guided_setups')") is None

    asyncio.run(scenario())
