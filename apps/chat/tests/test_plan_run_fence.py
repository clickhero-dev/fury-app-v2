import asyncio
import httpx
from plan_tools import PlanTools


def test_create_sends_run_lease_to_write_service():
    async def scenario():
        requests = []
        async def handler(request):
            requests.append(request)
            return httpx.Response(409)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            plans = PlanTools('https://example.com', 'token', client, '123e4567-e89b-12d3-a456-426614174000', run_id='123e4567-e89b-12d3-a456-426614174001', lease_id='123e4567-e89b-12d3-a456-426614174002')
            await plans._request('POST', body={'title': 'Plano', 'goal': 'Objetivo', 'tasks': []}, operation_id='call-1')
        assert requests[0].url.path.endswith('/plans/from-run')
        assert requests[0].headers['x-chat-run-id'] == '123e4567-e89b-12d3-a456-426614174001'
        assert requests[0].headers['x-chat-run-lease'] == '123e4567-e89b-12d3-a456-426614174002'
    asyncio.run(scenario())


def test_explicit_operation_id_is_forwarded_unchanged():
    async def scenario():
        requests = []
        async def handler(request):
            requests.append(request)
            return httpx.Response(409)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            plans = PlanTools('https://example.com', 'token', client, '123e4567-e89b-12d3-a456-426614174000', run_id='123e4567-e89b-12d3-a456-426614174001', lease_id='123e4567-e89b-12d3-a456-426614174002')
            tasks = [{'key': 'a', 'title': 'a', 'capability': 'read_brand', 'parameters': {}, 'dependsOn': []}]
            await plans._request('POST', body={'title': 'Plano', 'goal': 'Objetivo', 'tasks': tasks}, operation_id='call-A')
            await plans._request('POST', body={'title': 'Plano', 'goal': 'Objetivo', 'tasks': tasks}, operation_id='call-B')
        assert [r.headers['x-chat-operation-id'] for r in requests] == ['call-A', 'call-B']
    asyncio.run(scenario())


def test_direct_fenced_create_without_agno_call_id_is_rejected():
    async def scenario():
        requests = []
        async def handler(request):
            requests.append(request)
            return httpx.Response(409)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            plans = PlanTools('https://example.com', 'token', client, '123e4567-e89b-12d3-a456-426614174000', run_id='123e4567-e89b-12d3-a456-426614174001', lease_id='123e4567-e89b-12d3-a456-426614174002')
            tasks = [{'key': 'a', 'title': 'a', 'capability': 'read_brand', 'parameters': {}, 'dependsOn': []}]
            await plans.create_plan('Plano', 'Objetivo', tasks)
            await plans.create_plan('Plano', 'Objetivo', tasks)
        assert not requests
    asyncio.run(scenario())


def test_agno_replay_uses_same_operation_and_missing_id_fails_closed():
    from agno.tools.function import FunctionCall
    from plan_tools import tools_for_agent

    async def scenario():
        requests = []
        async def handler(request):
            requests.append(request)
            return httpx.Response(409)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            plans = PlanTools('https://example.com', 'token', client, '123e4567-e89b-12d3-a456-426614174000', run_id='123e4567-e89b-12d3-a456-426614174001', lease_id='123e4567-e89b-12d3-a456-426614174002')
            function = tools_for_agent(plans)[0]
            assert set(function.to_dict()['parameters']['properties']) == {'title', 'goal', 'tasks'}
            args = {'title': 'Plano', 'goal': 'Objetivo', 'tasks': [{'key': 'a', 'title': 'a', 'capability': 'read_brand', 'parameters': {}, 'dependsOn': []}]}
            for call_id in ('call-A', 'call-A', 'call-B', None):
                result = await FunctionCall(function=function, arguments=args, call_id=call_id).aexecute()
                if call_id is None:
                    assert result.result['code'] == 'unavailable'
        assert len(requests) == 3
        ids = [r.headers['x-chat-operation-id'] for r in requests]
        assert ids[0] == ids[1] != ids[2]
    asyncio.run(scenario())


def test_agent_real_model_round_trip_replays_call_id():
    import json
    from agno.agent import Agent
    from agno.models.openrouter import OpenRouter
    from plan_tools import tools_for_agent
    from tool_budget import budget_tool_result

    async def scenario():
        api_ids = []
        model_count = 0
        args = {'title': 'Plano', 'goal': 'Objetivo', 'tasks': [{'key': 'a', 'title': 'a', 'capability': 'read_brand', 'parameters': {}, 'dependsOn': []}]}
        async def api(request):
            api_ids.append(request.headers['x-chat-operation-id'])
            return httpx.Response(409)
        def model(request):
            nonlocal model_count
            model_count += 1
            body = json.loads(request.content)
            schema = next(x['function'] for x in body['tools'] if x['function']['name'] == 'create_plan')
            assert set(schema['parameters']['properties']) == {'title', 'goal', 'tasks'}
            if model_count <= 3:
                call_id = 'call-A' if model_count <= 2 else 'call-B'
                message = {'role': 'assistant', 'content': None, 'tool_calls': [{'id': call_id, 'type': 'function', 'function': {'name': 'create_plan', 'arguments': json.dumps(args)}}]}
                finish = 'tool_calls'
            else:
                message, finish = {'role': 'assistant', 'content': 'Fim'}, 'stop'
            return httpx.Response(200, json={'id': 'test', 'object': 'chat.completion', 'created': 1, 'model': 'test', 'choices': [{'index': 0, 'message': message, 'finish_reason': finish}]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(api)) as api_client, httpx.AsyncClient(transport=httpx.MockTransport(model)) as model_client:
            plans = PlanTools('https://example.com', 'token', api_client, '123e4567-e89b-12d3-a456-426614174000', run_id='123e4567-e89b-12d3-a456-426614174001', lease_id='123e4567-e89b-12d3-a456-426614174002')
            agent = Agent(model=OpenRouter(id='test', api_key='test', http_client=model_client), tools=tools_for_agent(plans), tool_hooks=[budget_tool_result], telemetry=False)
            result = await agent.arun('Crie um plano')
            assert result.content == 'Fim'
        assert len(api_ids) == 3
        assert api_ids[0] == api_ids[1] != api_ids[2]
    asyncio.run(scenario())
