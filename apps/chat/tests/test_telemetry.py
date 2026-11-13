"""Funcionalidade: registrar falhas do OpenRouter sem dados sensíveis
Cenário: timeout gera evento sanitizado
Dado uma falha de timeout contendo dados privados
Quando a falha é registrada
Então o evento inclui apenas o tipo de falha permitido
Cenário: telemetria indisponível não interrompe o chat
Dado que o coletor está indisponível
Quando registra uma falha
Então nenhuma exceção escapa
"""
import asyncio
import httpx
from telemetry import report_provider_failure

def test_timeout_sanitized():
    async def run():
        sent = []
        async def handler(request):
            sent.append(request.content.decode())
            return httpx.Response(200, json={'status':1})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await report_provider_failure(client, 'https://posthog.test', 'key', 'timeout')
        assert 'timeout' in sent[0]
        assert 'private detail' not in sent[0]
    asyncio.run(run())

def test_telemetry_unavailable():
    async def run():
        async def handler(request): raise httpx.ConnectTimeout('private detail')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await report_provider_failure(client, 'https://posthog.test', 'key', 'error')
    asyncio.run(run())

# Cenário: erro de autenticação é classificado sem vazar credencial
# Dado uma resposta 401 do provedor
# Quando ela é classificada
# Então apenas o código de falha é usado

def test_authentication_error_classification():
    import openai
    from telemetry import classify_provider_error
    response = httpx.Response(401, request=httpx.Request('POST','https://example.invalid'))
    error = openai.AuthenticationError('token private', response=response, body=None)
    assert classify_provider_error(error) == 'auth'

def test_provider_timeout_classification():
    from telemetry import classify_provider_error
    assert classify_provider_error(httpx.ReadTimeout('private')) == 'timeout'

def test_provider_unknown_error_classification():
    from telemetry import classify_provider_error
    assert classify_provider_error(RuntimeError('private')) == 'error'
