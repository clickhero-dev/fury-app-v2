"""Consultas confirmadas podem ser reutilizadas; mutações jamais entram no cache."""
import asyncio

import pytest

from checkpoints import CACHE_MISS
from checkpoint_tools import checkpointed_tool


class Store:
    def __init__(self):
        self.value = CACHE_MISS
        self.events = []
        self.fail_write = False

    async def cached_tool(self, name, args):
        self.events.append(('read', name, args))
        return self.value

    async def record_tool(self, name, args, value):
        if self.fail_write:
            raise RuntimeError('private database error')
        self.events.append(('write', name, args))
        self.value = value


def tool(name, value, calls):
    async def execute(**kwargs):
        calls.append(kwargs)
        return value
    execute.__name__ = name
    return execute


def test_confirmed_read_is_frozen_but_reauthorized_through_original_adapter():
    async def run():
        store, calls = Store(), []
        function = tool('brand', {'name': 'Flores'}, calls)
        assert await checkpointed_tool(store, function, {}) == {'name': 'Flores'}
        assert await checkpointed_tool(store, function, {}) == {'name': 'Flores'}
        assert calls == [{}, {}]
        assert [event[0] for event in store.events] == ['read', 'write', 'read']
    asyncio.run(run())


def test_revoked_access_never_returns_cached_result():
    async def run():
        store, calls = Store(), []
        store.value = {'name': 'previously authorized private brand'}
        result = await checkpointed_tool(
            store, tool('brand', {'error': 'Access revoked'}, calls), {},
        )
        assert result == {'error': 'Access revoked'}
        assert len(calls) == 1
        assert 'private brand' not in str(result)
        assert not any(event[0] == 'write' for event in store.events)
    asyncio.run(run())


def test_read_results_are_redacted_before_checkpoint_and_model():
    async def run():
        store, calls = Store(), []
        result = await checkpointed_tool(
            store,
            tool('brand', {'name': 'Flores', 'token': 'private', 'note': 'Bearer private'}, calls),
            {},
        )
        assert result == {'name': 'Flores', 'note': '[credencial omitida]'}
        assert store.value == result
    asyncio.run(run())


@pytest.mark.parametrize('name', ['propose_image', 'create_plan', 'quotas', 'video_job'])
def test_mutations_and_volatile_reads_never_use_cache(name):
    async def run():
        store, calls = Store(), []
        function = tool(name, {'ok': True}, calls)
        await checkpointed_tool(store, function, {})
        await checkpointed_tool(store, function, {})
        assert len(calls) == 2
        assert store.events == []
    asyncio.run(run())


@pytest.mark.parametrize('result', [
    {'error': 'Unavailable'}, {'success': False}, {'partial_failures': ['brand']},
    {'status': 'failed'}, {'data': {'errors': ['not verified']}},
    {'ok': False}, {'data': [{'success': False}]},
])
def test_unconfirmed_reads_are_not_saved(result):
    async def run():
        store, calls = Store(), []
        await checkpointed_tool(store, tool('brand', result, calls), {})
        assert not any(event[0] == 'write' for event in store.events)
    asyncio.run(run())


def test_database_failure_propagates_without_claiming_saved_result():
    async def run():
        store, calls = Store(), []
        store.fail_write = True
        with pytest.raises(RuntimeError):
            await checkpointed_tool(store, tool('brand', {'name': 'Flores'}, calls), {})
        assert store.value is CACHE_MISS
    asyncio.run(run())


def test_guarded_failure_is_classified_and_logged_without_sensitive_details(caplog):
    from checkpoint_tools import SafeToolFailure, guarded_checkpointed_tool

    async def run():
        async def broken(**_kwargs):
            raise RuntimeError('sensitive provider token and user content')
        with pytest.raises(SafeToolFailure) as error:
            await guarded_checkpointed_tool(Store(), broken, {}, name='guided_setup_answer')
        assert 'sensitive' not in str(error.value)

    asyncio.run(run())
    assert 'RuntimeError' in caplog.text
    assert 'sensitive' not in caplog.text


def test_guard_preserves_transient_profile_reconciliation_for_recovery():
    from checkpoint_tools import guarded_checkpointed_tool
    from chat_read_tools import ProfileSyncTransient

    async def run():
        async def broken(**_kwargs):
            raise ProfileSyncTransient('Não foi possível confirmar o contexto.')
        with pytest.raises(ProfileSyncTransient):
            await guarded_checkpointed_tool(Store(), broken, {}, name='guided_setup_answer')
    asyncio.run(run())


def test_real_agno_hook_reuses_confirmed_read_after_provider_failure():
    import json
    import httpx
    from agno.agent import Agent
    from agno.models.openrouter import OpenRouter
    from model_request_budget import (
        create_budgeted_http_client, provider_retry_scope, mark_provider_output,
    )
    from streaming import checked_agent_events, ProviderRunError

    async def run():
        store, reads = Store(), []
        should_fail = True

        async def brand():
            """Consultar os dados autorizados da marca."""
            reads.append('brand')
            return {'name': 'Flores'}

        async def hook(function, args, function_name=None):
            mark_provider_output()
            return await checkpointed_tool(store, function, args, name=function_name)

        def chunk(delta, finish=None):
            return 'data: ' + json.dumps({'id': 'test', 'choices': [
                {'index': 0, 'delta': delta, 'finish_reason': finish},
            ]}) + '\n\n'

        def handler(request):
            messages = json.loads(request.content)['messages']
            if any(message['role'] == 'tool' for message in messages):
                if should_fail:
                    return httpx.Response(503, json={'error': {'message': 'private provider failure'}})
                text = chunk({'content': 'Legenda pronta.'}) + chunk({}, 'stop')
            else:
                text = chunk({'tool_calls': [{
                    'index': 0, 'id': 'read-brand', 'type': 'function',
                    'function': {'name': 'brand', 'arguments': '{}'},
                }]}) + chunk({}, 'tool_calls')
            return httpx.Response(200, headers={'content-type': 'text/event-stream'},
                                  content=text + 'data: [DONE]\n\n')

        async with create_budgeted_http_client(transport=httpx.MockTransport(handler)) as http:
            def make_agent():
                return Agent(model=OpenRouter(id='synthetic', api_key='synthetic',
                                               max_retries=0, retries=0, http_client=http),
                             tools=[brand], tool_hooks=[hook], telemetry=False)
            with provider_retry_scope() as state:
                with pytest.raises(ProviderRunError):
                    async for _ in checked_agent_events(
                        make_agent().arun('Prepare um post', stream=True), state,
                    ):
                        pass
            assert store.value == {'name': 'Flores'}
            should_fail = False
            output = []
            with provider_retry_scope() as state:
                async for event in checked_agent_events(
                    make_agent().arun('Prepare um post', stream=True), state,
                ):
                    if isinstance(getattr(event, 'content', None), str):
                        output.append(event.content)
            assert ''.join(output) == 'Legenda pronta.'
            assert reads == ['brand', 'brand']
    asyncio.run(run())
