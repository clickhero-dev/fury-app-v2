"""Funcionalidade: limitar todo pedido enviado ao modelo
Cenário: payload acima do orçamento não chega ao transporte
Dado uma requisição de chat maior que o limite seguro
Quando o cliente de modelo tenta enviá-la
Então a requisição é bloqueada antes do transporte
Cenário: payload pequeno continua autorizado
Dado uma requisição de chat dentro do orçamento
Quando o cliente de modelo a envia
Então o transporte simulado recebe a requisição
Cenário: o modelo configurado usa tokenizer e reserva de saída
Dado um payload DeepSeek serializado
Quando o limite de contexto é estimado
Então são contados os tokens e reservada a resposta
"""
import asyncio
import json
from importlib import import_module
from typing import cast

import httpx

import app

OpenRouter = import_module('agno.models.openrouter').OpenRouter
ModelRequestBudgetExceeded = import_module('model_request_budget').ModelRequestBudgetExceeded


def test_deepseek_estimator_uses_project_tokenizer_and_response_reserve():
    budget = import_module('model_request_budget')
    body = json.dumps({
        'model': budget.DEEPSEEK_V4_MODEL,
        'messages': [{'role': 'user', 'content': 'Conteúdo sintético para validar a contagem.'}],
    }, ensure_ascii=False).encode('utf-8')
    serialized = body.decode('utf-8')

    assert budget.estimate_request_tokens(body) == (
        budget.count_tokens(serialized) + budget.MODEL_RESPONSE_RESERVE_TOKENS + 16
    )


def test_model_request_budget_blocks_large_body_before_transport():
    factory = getattr(app, 'create_model_http_client', None)
    assert callable(factory), 'chat model HTTP client must enforce a request budget'

    async def run():
        sent = []

        async def handler(request):
            sent.append(request.content)
            return httpx.Response(200, json={'ok': True})

        client = cast(httpx.AsyncClient, factory(
            max_tokens=128,
            response_reserve=0,
            counter=lambda text: len(text),
            transport=httpx.MockTransport(handler),
        ))
        try:
            try:
                await client.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    json={'model': 'other/model', 'messages': [{'role': 'user', 'content': 'x' * 400}]},
                )
            except Exception as error:
                assert isinstance(error, ModelRequestBudgetExceeded)
            else:
                raise AssertionError('oversized model request reached the transport boundary')
            assert sent == []
            response = await client.post(
                'https://openrouter.ai/api/v1/chat/completions',
                json={'model': 'other/model', 'messages': [{'role': 'user', 'content': 'ok'}]},
            )
            assert response.status_code == 200
            assert len(sent) == 1
        finally:
            await client.aclose()

    asyncio.run(run())


def test_openrouter_async_client_enforces_the_same_request_guard():
    factory = getattr(app, 'create_model_http_client', None)
    assert callable(factory)

    async def run():
        sent = []

        async def handler(request):
            sent.append(json.loads(request.content))
            return httpx.Response(200, json={
                'id': 'mock',
                'object': 'chat.completion',
                'created': 1,
                'model': 'test-model',
                'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': 'ok'}, 'finish_reason': 'stop'}],
            })

        client = cast(httpx.AsyncClient, factory(
            max_tokens=512,
            response_reserve=0,
            transport=httpx.MockTransport(handler),
        ))
        model = OpenRouter(id='test-model', api_key='test-only', http_client=client, max_retries=0)
        openrouter = model.get_async_client()
        try:
            try:
                await openrouter.chat.completions.create(
                    model='test-model',
                    messages=[{'role': 'user', 'content': 'x' * 2_000}],
                )
            except Exception as error:
                openai = import_module('openai')
                assert isinstance(error, openai.OpenAIError)
                assert not isinstance(error, openai.APIConnectionError)
            else:
                raise AssertionError('oversized OpenRouter request was not rejected')
            assert sent == []
            response = await openrouter.chat.completions.create(
                model='test-model',
                messages=[{'role': 'user', 'content': 'olá'}],
            )
            assert response.choices[0].message.content == 'ok'
            assert len(sent) == 1
            assert sent[0]['messages'][0]['content'] == 'olá'
        finally:
            await client.aclose()

    asyncio.run(run())


def test_agno_error_wrapper_preserves_budget_classification():
    classifier = getattr(app, 'is_model_request_budget_error', None)
    assert callable(classifier), 'wrapped model budget errors must remain identifiable'

    async def run():
        sent = []

        async def handler(request):
            sent.append(request.content)
            return httpx.Response(200, json={})

        client = cast(httpx.AsyncClient, app.create_model_http_client(
            max_tokens=512,
            response_reserve=0,
            transport=httpx.MockTransport(handler),
        ))
        model = OpenRouter(id='test-model', api_key='test-only', http_client=client, max_retries=0)
        message_type = import_module('agno.models.message').Message
        try:
            try:
                await model.ainvoke(
                    [message_type(role='user', content='x' * 2_000)],
                    message_type(role='assistant'),
                )
            except Exception as error:
                assert classifier(error)
            else:
                raise AssertionError('oversized Agno request was not rejected')
            assert sent == []
        finally:
            await client.aclose()

    asyncio.run(run())
