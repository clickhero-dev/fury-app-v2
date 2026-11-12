"""Actor-bound persistence for deterministic approval refusals."""
import json
from uuid import UUID


# Exact generic result emitted by Node's ChatApprovalRepository.fail. Only this
# known placeholder can be enriched; never replace a completed or foreign result.
LEGACY_FAILURE = {'error': 'Não foi possível confirmar o resultado. Verifique os dados antes de tentar novamente.'}


class ApprovalRepository:
    def __init__(self, db, tenant_id: UUID, user_id: UUID):
        self.db = db
        self.tenant_id = tenant_id
        self.user_id = user_id

    async def record_failure(self, approval_id: UUID, result: dict) -> bool:
        row = await self.db.fetchrow("""UPDATE chat_approvals SET status='failed', result=$1::jsonb
            WHERE id=$2 AND tenant_id=$3 AND user_id=$4
              AND ((status IN ('approved','executing') AND result IS NULL)
                OR (status='failed' AND (result IS NULL OR result=$5::jsonb OR result=$1::jsonb)))
            RETURNING id""", json.dumps(result), approval_id, self.tenant_id, self.user_id,
            json.dumps(LEGACY_FAILURE))
        return row is not None
