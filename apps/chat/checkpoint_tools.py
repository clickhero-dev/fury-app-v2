"""Read-only tool checkpoints; external effects remain outside replay."""
import asyncio
import logging

from checkpoints import CACHE_MISS, READ_ARGUMENTS, redact_checkpoint_data
from tool_budget import budget_tool_result


logger = logging.getLogger(__name__)


class ToolFailure(RuntimeError):
    """Sanitized failure, classified without retaining tool input in its message."""

    def __init__(self, phase):
        self.phase = phase
        super().__init__('Não foi possível executar a ferramenta com segurança.')


async def _phase(phase, operation):
    try:
        return await operation()
    except Exception:
        # Do not log exception details, function names, arguments or results.
        logger.warning('Chat tool failure phase=%s', phase)
        raise ToolFailure(phase) from None


class ToolGuard:
    """Per-run hook: once any tool fails, no later tool may execute."""

    def __init__(self, checkpoints):
        self.checkpoints = checkpoints
        self._failure = None
        self._lock = asyncio.Lock()

    @property
    def failed(self):
        return self._failure is not None

    async def __call__(self, function, args, function_name=None):
        async with self._lock:
            if self._failure is not None:
                raise ToolFailure(self._failure) from None
            try:
                return await checkpointed_tool(self.checkpoints, function, args, name=function_name)
            except ToolFailure as error:
                self._failure = error.phase
                raise
            except asyncio.CancelledError:
                # The interrupted tool may already have produced an effect.
                self._failure = 'execution'
                raise
            except Exception:
                self._failure = 'execution'
                logger.warning('Chat tool failure phase=execution')
                raise ToolFailure('execution') from None


async def _read_result(function, args):
    return redact_checkpoint_data(await budget_tool_result(function, args))


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
        return await _phase('execution', lambda: budget_tool_result(function, args))
    cached = await _phase('lookup', lambda: checkpoints.cached_tool(name, args))
    if cached is not CACHE_MISS:
        # The chat entrypoint itself is not an RBAC gate. Re-enter the original
        # read adapter to verify today's permissions/resource access; never
        # serve the frozen result if this check fails or cannot be completed.
        current = await _phase('execution', lambda: _read_result(function, args))
        return cached if _confirmed(current) else current
    result = await _phase('execution', lambda: _read_result(function, args))
    if _confirmed(result):
        await _phase('write', lambda: checkpoints.record_tool(name, args, result))
    return result
