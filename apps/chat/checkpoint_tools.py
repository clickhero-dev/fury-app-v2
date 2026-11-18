"""Read-only tool checkpoints; external effects remain outside replay."""
import logging

from checkpoints import CACHE_MISS, READ_ARGUMENTS, redact_checkpoint_data
from tool_budget import budget_tool_result


class SafeToolFailure(RuntimeError):
    """A tool or its checkpoint failed; never expose its original exception."""


async def guarded_checkpointed_tool(checkpoints, function, args, *, name=None):
    try:
        return await checkpointed_tool(checkpoints, function, args, name=name)
    except Exception as error:
        # Do not log exception messages, arguments, tracebacks, or tool output.
        logging.getLogger('ady.chat').error('tool_or_checkpoint_failure type=%s', type(error).__name__)
        raise SafeToolFailure('Não foi possível preservar o trabalho desta resposta.') from None


def _confirmed(value):
    if isinstance(value, dict):
        if value.get('error') or value.get('errors') or value.get('partial_failures'):
            return False
        if value.get('success') is False or value.get('ok') is False:
            return False
        if value.get('status') in ('error', 'failed'):
            return False
        return all(_confirmed(item) for item in value.values())
    if isinstance(value, list):
        return all(_confirmed(item) for item in value)
    return True


async def checkpointed_tool(checkpoints, function, args, *, name=None):
    # Agno passes a next_func continuation, not the original bound method.
    name = name if name is not None else getattr(function, '__name__', '')
    if name not in READ_ARGUMENTS:
        return await budget_tool_result(function, args)
    cached = await checkpoints.cached_tool(name, args)
    if cached is not CACHE_MISS:
        # The chat entrypoint itself is not an RBAC gate. Re-enter the original
        # read adapter to verify today's permissions/resource access; never
        # serve the frozen result if this check fails or cannot be completed.
        current = redact_checkpoint_data(await budget_tool_result(function, args))
        return cached if _confirmed(current) else current
    result = redact_checkpoint_data(await budget_tool_result(function, args))
    if _confirmed(result):
        await checkpoints.record_tool(name, args, result)
    return result
