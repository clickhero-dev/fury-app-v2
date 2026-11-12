"""Domain classification of proven refusals, never provider-supplied copy."""
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID


MESSAGES = {
    'VIDEO_NOT_IN_PLAN': 'A criação de vídeos não está disponível no seu plano atual.',
    'VIDEO_QUOTA_EXCEEDED': 'O limite de criação de vídeos deste período foi atingido.',
    'MODIFICATION_QUOTA_EXCEEDED': 'O limite de alterações deste vídeo foi atingido.',
    'SERVICE_BLOCKED': 'Esta ação não está disponível para sua conta.',
}


@dataclass(frozen=True)
class ActionRefusal:
    code: str

    @property
    def message(self) -> str:
        return MESSAGES[self.code]

    def result(self) -> dict:
        return {'code': self.code, 'error': self.message}

    def detail(self) -> dict:
        return {'status': 'failed', 'code': self.code, 'message': self.message}


class FailureRepository(Protocol):
    async def record_failure(self, approval_id: UUID, result: dict) -> bool: ...


class UnconfirmedOutcome(Exception):
    """The refusal could not be durably associated with this actor's action."""


class ActionOutcomes:
    def __init__(self, repository: FailureRepository):
        self.repository = repository

    @staticmethod
    def classify(status_code: int, payload) -> ActionRefusal | None:
        if status_code != 403 or not isinstance(payload, dict):
            return None
        error = payload.get('error')
        code = error.get('code') if isinstance(error, dict) else None
        if isinstance(code, str) and code in MESSAGES:
            return ActionRefusal(code)
        return None

    async def record_refusal(self, approval_id: UUID, status_code: int, payload) -> ActionRefusal | None:
        refusal = self.classify(status_code, payload)
        if refusal is None:
            return None
        try:
            persisted = await self.repository.record_failure(approval_id, refusal.result())
        except Exception:
            raise UnconfirmedOutcome() from None
        if not persisted:
            raise UnconfirmedOutcome()
        return refusal
