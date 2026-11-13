"""Telemetria de falhas sem payload, token ou dados da conversa."""
import logging
import httpx

log = logging.getLogger('ady.chat')
ALLOWED = frozenset(('timeout', 'auth', 'error'))


def classify_provider_error(error: Exception) -> str:
    import openai
    if isinstance(error, (openai.APITimeoutError, httpx.TimeoutException, TimeoutError)):
        return 'timeout'
    if isinstance(error, openai.AuthenticationError):
        return 'auth'
    return 'error'


async def report_provider_failure(client: httpx.AsyncClient, host: str, key: str, kind: str) -> None:
    safe = kind if kind in ALLOWED else 'error'
    log.warning('Falha de provedor OpenRouter: %s', safe)
    if not key:
        return
    try:
        await client.post(host.rstrip('/') + '/capture/', json={'api_key':key, 'event':'chat_provider_failure', 'properties':{'distinct_id':'chat-service','provider':'openrouter','kind':safe}}, timeout=3.0)
    except httpx.HTTPError:
        log.warning('Telemetria do chatbot indisponível')
