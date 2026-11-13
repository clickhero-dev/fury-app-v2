"""Fail-closed size guard for every OpenRouter chat-completion request."""
import json
from typing import Callable

import httpx
from openai import OpenAIError

from memory import count_tokens

MAX_MODEL_REQUEST_TOKENS = 50_000
MODEL_RESPONSE_RESERVE_TOKENS = 4_096
DEEPSEEK_V4_MODEL = 'deepseek/deepseek-v4-pro-0813'


class ModelRequestBudgetExceeded(OpenAIError):
    """Safe-to-surface rejection that the OpenAI SDK will not wrap as a network error."""


def is_model_request_budget_error(error: Exception) -> bool:
    """Recognize the guard error after Agno wraps it in a provider exception."""
    seen = set()
    current = error
    while current is not None and id(current) not in seen:
        if isinstance(current, ModelRequestBudgetExceeded):
            return True
        seen.add(id(current))
        current = getattr(current, '__cause__', None) or getattr(current, '__context__', None)
    return False


def estimate_request_tokens(body: bytes, *, counter: Callable[[str], int] | None = None, response_reserve: int = MODEL_RESPONSE_RESERVE_TOKENS) -> int:
    """Conservatively count the serialized request plus response/framing reserve."""
    try:
        text = body.decode('utf-8')
        payload = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ModelRequestBudgetExceeded('Não foi possível validar o tamanho da requisição do modelo.') from error

    if not isinstance(payload, dict):
        raise ModelRequestBudgetExceeded('Não foi possível validar o tamanho da requisição do modelo.')
    model = payload.get('model')
    try:
        input_tokens = (counter or count_tokens)(text) if model == DEEPSEEK_V4_MODEL else len(body)
    except Exception as error:
        raise ModelRequestBudgetExceeded('Não foi possível validar o tamanho da requisição do modelo.') from error
    return input_tokens + response_reserve + 16


def create_budgeted_http_client(
    *,
    max_tokens: int = MAX_MODEL_REQUEST_TOKENS,
    response_reserve: int = MODEL_RESPONSE_RESERVE_TOKENS,
    counter: Callable[[str], int] | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> httpx.AsyncClient:
    """Build an HTTPX client that blocks oversized chat requests before transport."""
    if max_tokens < 1 or response_reserve < 0:
        raise ValueError('Invalid model request budget')

    async def guard_request(request: httpx.Request) -> None:
        if request.method.upper() != 'POST' or not request.url.path.endswith('/chat/completions'):
            return
        body = await request.aread()
        if estimate_request_tokens(body, counter=counter, response_reserve=response_reserve) >= max_tokens:
            raise ModelRequestBudgetExceeded('A conversa excede o limite seguro de contexto do modelo.')

    return httpx.AsyncClient(
        timeout=60,
        transport=transport,
        event_hooks={'request': [guard_request]},
    )
