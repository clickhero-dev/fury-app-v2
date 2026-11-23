"""Telemetria de falhas sem payload, token ou dados da conversa."""
import logging
import httpx

log = logging.getLogger('ady.chat')
ALLOWED = frozenset(('timeout', 'auth', 'error'))


def classify_provider_error(error: Exception) -> str:
    import openai
    from streaming import ProviderRunError
    from multi_provider_core import ProviderFailure
    if isinstance(error, (ProviderRunError, ProviderFailure)):
        return error.kind if error.kind in ALLOWED else 'error'
    if isinstance(error, (openai.APITimeoutError, httpx.TimeoutException, TimeoutError)):
        return 'timeout'
    if isinstance(error, openai.AuthenticationError):
        return 'auth'
    return 'error'


async def report_provider_failure(client: httpx.AsyncClient, host: str, key: str, kind: str, provider: str = 'openrouter') -> None:
    safe = kind if kind in ALLOWED else 'error'
    provider = provider if provider in ('openai', 'anthropic', 'openrouter') else 'unknown'
    log.warning('Falha de provedor %s: %s', provider, safe)
    if not key:
        return
    try:
        await client.post(host.rstrip('/') + '/capture/', json={'api_key':key, 'event':'chat_provider_failure', 'properties':{'distinct_id':'chat-service','provider':provider,'kind':safe}}, timeout=3.0)
    except httpx.HTTPError:
        log.warning('Telemetria do chatbot indisponível')
