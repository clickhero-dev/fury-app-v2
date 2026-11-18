"""Fenced, per-message guided-setup persistence and profile preconditions."""
import json
from contextlib import asynccontextmanager

import asyncpg

from guided_setup import BUSINESS_NAME, OFFERING, SetupState, advance, question_for
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
        row = await conn.fetchrow('''SELECT step,answers,profile_user_version,profile_tenant_version
            FROM chat_guided_setups WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE''',
            self.tenant_id, self.user_id)
        await self._check_lease(conn)
        return row

    async def _snapshot(self, conn):
        return await conn.fetchrow('''SELECT step,answers,profile_user_version,profile_tenant_version FROM chat_guided_setup_snapshots
            WHERE conversation_id=$1 AND user_message_id=$2''',
            self.conversation_id, self.user_message_id)

    async def pending_profile_update(self):
        """Return a committed profile intent for downstream idempotent reconciliation."""
        async with self._fenced() as conn:
            receipt = await conn.fetchrow('''SELECT result FROM chat_guided_setup_receipts
                WHERE conversation_id=$1 AND user_message_id=$2''',
                self.conversation_id, self.user_message_id)
            if receipt is None:
                return None
            result = _decode(receipt['result'])
            if not isinstance(result, dict):
                raise TypeError('Invalid guided setup receipt')
            update = result.get('profileUpdate')
            if update is not None and (not isinstance(update, dict) or
                    not isinstance(update.get('tenantName'), str) or
                    not isinstance(update.get('businessContext'), str)):
                raise TypeError('Invalid guided profile intent')
            return update

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
            row = await self._locked_state(conn)
            state = _state(row)
            versions = None
            if state.step == BUSINESS_NAME:
                versions = await conn.fetchrow('''SELECT u.xmin::text AS "userVersion",
                    t.xmin::text AS "tenantVersion" FROM users u JOIN tenants t ON t.id=u.tenant_id
                    WHERE u.id=$1 AND t.id=$2''', self.user_id, self.tenant_id)
                if versions is None:
                    raise RunExpired()
            elif state.step == OFFERING:
                versions = {'userVersion': row.get('profile_user_version'),
                            'tenantVersion': row.get('profile_tenant_version')}
            await conn.execute('''INSERT INTO chat_guided_setup_snapshots
                (conversation_id,user_message_id,step,answers,profile_user_version,profile_tenant_version)
                VALUES($1,$2,$3,$4::jsonb,$5,$6)
                ON CONFLICT (conversation_id,user_message_id) DO NOTHING''',
                self.conversation_id, self.user_message_id, state.step, json.dumps(state.answers or {}),
                versions['userVersion'] if versions else None, versions['tenantVersion'] if versions else None)
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
            row = await self._locked_state(conn)
            state = _state(row)
            if state.step != expected.step or (state.answers or {}) != (expected.answers or {}):
                raise StaleSetupTurn()
            next_state = advance(state, answer)
            result = _result(next_state, state.step)
            if 'profileUpdate' in result:
                user_version = snapshot['profile_user_version']
                tenant_version = snapshot['profile_tenant_version']
                if (not user_version or not tenant_version or
                        user_version != row.get('profile_user_version') or
                        tenant_version != row.get('profile_tenant_version')):
                    del result['profileUpdate']
                    result['contextSaved'] = False
                    result['contextError'] = ('Confira e atualize o nome e o contexto pelo fluxo normal de perfil.')
                else:
                    result['profileExpected'] = {'userVersion': user_version, 'tenantVersion': tenant_version}
                    result['nameVersionConfirmed'] = True
            if state.step == BUSINESS_NAME:
                await conn.execute('''UPDATE chat_guided_setups SET step=$3,answers=$4::jsonb,
                    profile_user_version=$5,profile_tenant_version=$6,
                    updated_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2''',
                    self.tenant_id, self.user_id, next_state.step, json.dumps(next_state.answers or {}),
                    snapshot['profile_user_version'], snapshot['profile_tenant_version'])
            else:
                await conn.execute('''UPDATE chat_guided_setups SET step=$3,answers=$4::jsonb,
                    updated_at=clock_timestamp() WHERE tenant_id=$1 AND user_id=$2''',
                    self.tenant_id, self.user_id, next_state.step, json.dumps(next_state.answers or {}))
            await conn.execute('''INSERT INTO chat_guided_setup_receipts
                (conversation_id,user_message_id,result) VALUES($1,$2,$3::jsonb)''',
                self.conversation_id, self.user_message_id, json.dumps(result))
            return {**result, 'replayed': False}
