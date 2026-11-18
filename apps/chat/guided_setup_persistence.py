"""Fenced, per-message guided-setup persistence.

``replayed`` is an at-most-once external-effect claim: callers must never invoke
the context writer on a replay. A crash after commit and before the HTTP call
may therefore leave the profile unsynchronized; exactly-once HTTP needs a
downstream idempotency key and cannot be guaranteed by a local transaction.
"""
import json
from contextlib import asynccontextmanager

import asyncpg

from guided_setup import OFFERING, SetupState, advance, question_for
from runs import RunExpired


class _SetupUnavailable(Exception):
    pass


class SnapshotMissing(ValueError):
    """A retry or answer has no pre-model snapshot and must fail closed."""
    def __init__(self):
        super().__init__('Não foi possível confirmar a etapa desta resposta. Confirme novamente a pergunta atual.')


class StaleSetupTurn(ValueError):
    """Another turn advanced the setup after this turn's snapshot."""
    def __init__(self):
        super().__init__('A configuração mudou. Confirme novamente a pergunta atual antes de continuar.')


def _decode(value):
    return json.loads(value) if isinstance(value, str) else value


def _state(row):
    if row is None:
        return SetupState()
    answers = _decode(row['answers'])
    if not isinstance(answers, dict):
        raise TypeError('Invalid guided setup answers')
    question_for(row['step'])  # Fail closed on corrupt persisted data.
    return SetupState(row['step'], dict(answers))


def _result(state, previous_step):
    answers = state.answers or {}
    result = {'step': state.step, 'answers': answers, **question_for(state.step)}
    if previous_step == OFFERING and answers.get('businessName') and answers.get('offering'):
        result['profileUpdate'] = {
            'tenantName': answers['businessName'],
            'businessContext': f"Produtos ou serviços: {answers['offering']}",
        }
    return result


class GuidedSetupPersistence:
    def __init__(self, pool, tenant_id, user_id, conversation_id, run_id, lease_id, user_message_id):
        self.pool = pool
        self.tenant_id, self.user_id = tenant_id, user_id
        self.conversation_id, self.run_id = conversation_id, run_id
        self.lease_id, self.user_message_id = lease_id, user_message_id

    async def _check_lease(self, conn):
        valid = await conn.fetchval('''SELECT 1 FROM chat_response_runs
            WHERE id=$1 AND conversation_id=$2 AND user_message_id=$3
            AND lease_id=$4 AND status='running' AND lease_until>clock_timestamp()''',
            self.run_id, self.conversation_id, self.user_message_id, self.lease_id)
        if not valid:
            raise RunExpired()

    @asynccontextmanager
    async def _fenced(self):
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                owned = await conn.fetchval('''SELECT id FROM chat_conversations
                    WHERE id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE''',
                    self.conversation_id, self.tenant_id, self.user_id)
                if not owned:
                    raise RunExpired()
                await conn.fetchval('SELECT id FROM chat_response_runs WHERE id=$1 FOR UPDATE', self.run_id)
                await self._check_lease(conn)
                yield conn
                # A concurrent tenant/user operation may have blocked us beyond
                # the lease deadline; rollback every write in that case.
                await self._check_lease(conn)

    async def current(self):
        try:
            async with self._fenced() as conn:
                try:
                    row = await conn.fetchrow('''SELECT step,answers FROM chat_guided_setups
                        WHERE tenant_id=$1 AND user_id=$2''', self.tenant_id, self.user_id)
                except asyncpg.UndefinedTableError as error:
                    raise _SetupUnavailable() from error
                return _state(row)
        except _SetupUnavailable:
            return SetupState()

    async def _locked_state(self, conn):
        await conn.execute('''INSERT INTO chat_guided_setups(tenant_id,user_id,step,answers)
            VALUES($1,$2,'invitation','{}'::jsonb) ON CONFLICT DO NOTHING''',
            self.tenant_id, self.user_id)
        row = await conn.fetchrow('''SELECT step,answers FROM chat_guided_setups
            WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE''', self.tenant_id, self.user_id)
        await self._check_lease(conn)
        return _state(row)

    async def _snapshot(self, conn):
        return await conn.fetchrow('''SELECT step,answers FROM chat_guided_setup_snapshots
            WHERE conversation_id=$1 AND user_message_id=$2''',
            self.conversation_id, self.user_message_id)

    async def capture_snapshot(self):
        """Call before invoking the model; retries can only load existing snapshots."""
        async with self._fenced() as conn:
            snapshot = await self._snapshot(conn)
            if snapshot is not None:
                return _state(snapshot)
            previous = await conn.fetchval('''SELECT EXISTS (
                SELECT 1 FROM chat_response_runs WHERE conversation_id=$1
                AND user_message_id=$2 AND id<>$3)''',
                self.conversation_id, self.user_message_id, self.run_id)
            if previous:
                raise SnapshotMissing()
            state = await self._locked_state(conn)
            await conn.execute('''INSERT INTO chat_guided_setup_snapshots
                (conversation_id,user_message_id,step,answers) VALUES($1,$2,$3,$4::jsonb)
                ON CONFLICT (conversation_id,user_message_id) DO NOTHING''',
                self.conversation_id, self.user_message_id, state.step, json.dumps(state.answers or {}))
            return _state(await self._snapshot(conn))

    async def save_answer(self, answer):
        async with self._fenced() as conn:
            receipt = await conn.fetchrow('''SELECT result FROM chat_guided_setup_receipts
                WHERE conversation_id=$1 AND user_message_id=$2''',
                self.conversation_id, self.user_message_id)
            if receipt is not None:
                result = _decode(receipt['result'])
                if not isinstance(result, dict):
                    raise TypeError('Invalid guided setup receipt')
                return {**result, 'replayed': True}
            snapshot = await self._snapshot(conn)
            if snapshot is None:
                raise SnapshotMissing()
            if not isinstance(answer, str) or not answer.strip() or len(answer) > 5000:
                raise ValueError('Resposta inválida.')
            expected = _state(snapshot)
            state = await self._locked_state(conn)
            if state.step != expected.step or (state.answers or {}) != (expected.answers or {}):
                raise StaleSetupTurn()
            next_state = advance(state, answer)
            result = _result(next_state, state.step)
            await conn.execute('''UPDATE chat_guided_setups SET step=$3,answers=$4::jsonb,
                updated_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2''',
                self.tenant_id, self.user_id, next_state.step, json.dumps(next_state.answers or {}))
            await conn.execute('''INSERT INTO chat_guided_setup_receipts
                (conversation_id,user_message_id,result) VALUES($1,$2,$3::jsonb)''',
                self.conversation_id, self.user_message_id, json.dumps(result))
            return {**result, 'replayed': False}
