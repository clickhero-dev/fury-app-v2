"""Typed references are data only: no substitution or resource lookup in the agent."""
import asyncio
import copy
import json

import httpx
import pytest

from test_plan_tools import BASE_URL, TOKEN, CONVERSATION_ID, plan, task


def ref(key, field='text'):
    return {'$result': {'task': key, 'field': field}}


def chain():
    return [
        task('idea', 'draft_text', {'prompt': 'Crie uma ideia.'}),
        task('caption', 'draft_text', {'prompt': ref('idea')}, ['idea']),
        task('art', 'propose_image', {'prompt': ref('caption'), 'model': 'black-forest-labs/flux.2-pro'}, ['caption']),
        task('review', 'manual', {'instructions': 'Revise legenda e arte.'}, ['caption', 'art']),
        task('post', 'propose_post', {'caption': ref('caption'), 'image_url': ref('art', 'assetUrl'), 'post_type': 'image', 'scheduled_at': '2099-11-10T15:00:00Z'}, ['caption', 'art', 'review']),
    ]


def test_create_and_read_preserve_typed_references_without_interpolation():
    from plan_tools import PlanTools
    async def run():
        tasks = chain()
        before = copy.deepcopy(tasks)
        stored = plan(tasks=[{**item, 'id': f'30000000-0000-4000-8000-{index:012d}', 'status': 'pending'} for index, item in enumerate(tasks, 1)])
        calls = []
        def handler(request):
            calls.append(request)
            if request.method == 'POST':
                assert json.loads(request.content)['tasks'] == tasks
                return httpx.Response(201, json={'plan': stored})
            return httpx.Response(200, json={'plans': [stored]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            tools = PlanTools(BASE_URL, TOKEN, client, CONVERSATION_ID)
            assert await tools.create_plan('Plano', 'Preparar', tasks) == {'plan': stored}
            assert await tools.list_plans() == {'plans': [stored]}
        assert tasks == before
        assert len(calls) == 2
    asyncio.run(run())


@pytest.mark.parametrize('case', ['no_direct_dep', 'future', 'field', 'source', 'media', 'extra', 'nested', 'literal', 'wrong_target', 'missing_source'])
def test_invalid_references_never_call_http(case):
    from plan_tools import PlanTools
    tasks = chain()
    if case == 'no_direct_dep':
        tasks[4]['dependsOn'] = ['review']
    elif case == 'future':
        tasks[0]['parameters']['prompt'] = ref('caption')
        tasks[0]['dependsOn'] = ['caption']
        tasks[1]['dependsOn'] = []
    elif case == 'field':
        tasks[4]['parameters']['caption'] = ref('caption', 'summary')
    elif case == 'source':
        tasks[4]['parameters']['caption'] = ref('art')
    elif case == 'media':
        tasks[4]['parameters']['post_type'] = 'reel'
    elif case == 'extra':
        tasks[4]['parameters']['image_url']['$result']['url'] = 'https://evil.test/x.png'
    elif case == 'nested':
        tasks[2]['parameters']['reference_image_urls'] = [ref('caption')]
    elif case == 'literal':
        tasks[2]['parameters']['model'] = 'invalid'
    elif case == 'wrong_target':
        tasks[3]['parameters']['instructions'] = ref('caption')
    else:
        tasks[4]['parameters']['caption'] = ref('missing')
    async def run():
        def forbidden(request):
            pytest.fail('Invalid reference reached HTTP')
        async with httpx.AsyncClient(transport=httpx.MockTransport(forbidden)) as client:
            result = await PlanTools(BASE_URL, TOKEN, client, CONVERSATION_ID).create_plan('Plano', 'Preparar', tasks)
            assert result['code'] == 'invalid_input'
    asyncio.run(run())


def test_prompt_documents_closed_contract_and_sensitive_confirmations():
    from plan_tools import PLAN_AGENT_INSTRUCTIONS, PlanTools
    instructions = ' '.join(PLAN_AGENT_INSTRUCTIONS) + PlanTools.create_plan.__doc__
    assert '$result' in instructions
    assert 'assetUrl' in instructions
    assert 'dependência direta' in instructions
    assert 'aprovação separada' in instructions
