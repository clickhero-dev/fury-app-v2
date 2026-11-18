"""Causal, first-write-wins snapshots; no recovery worker or mutation replay.

Pass only JSON domain data, never clients, headers or delegated identity. Database
errors intentionally propagate: callers must not continue with a rebuilt context
or execute a tool after a failed checkpoint lookup/write.
"""
from contextlib import asynccontextmanager
import hashlib
import json
import re

from runs import RunExpired

SCHEMA_VERSION = 1
MAX_CONTEXT_BYTES = 1024 * 1024
MAX_TOOL_BYTES = 128 * 1024
CACHE_MISS = object()  # None is a legitimate confirmed result.

# Deliberately exclude volatile quota, generation/job and diagnostic queries.
READ_ARGUMENTS = {
    'brand': frozenset(), 'profile': frozenset(),
    'calendar': frozenset(('start_date', 'end_date')),
    'campaigns': frozenset(('limit', 'offset')),
    'assets': frozenset(('page', 'limit', 'asset_type')),
    'brand_photos': frozenset(('kind', 'page', 'limit')),
    'campaign_ads': frozenset(('campaign_id',)),
    'ad_details': frozenset(('campaign_id', 'ad_id')),
    'ad_assets': frozenset(('campaign_id',)),
    'available_ad_assets': frozenset(('campaign_id',)),
}
_SECRET_KEYS = frozenset((
    'token', 'accesstoken', 'refreshtoken', 'authorization', 'password',
    'secret', 'clientsecret', 'apikey', 'cookie', 'setcookie', 'headers',
    'credentials', 'idtoken',
))
_SECRET_TEXT = re.compile(
    r'(?i)\bbearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
    r'|[?&](?:access_token|token|api_key|x-amz-signature|x-goog-signature)='
)
_SECRET_VALUE = re.compile(
    r'(?i)\bbearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
    r'|[?&](?:access_token|token|api_key|x-amz-signature|x-goog-signature)=[^&\s]*'
)


def redact_checkpoint_data(value):
    """Copy JSON data, omitting credential-shaped values before model/snapshot.

    Keep the repository strict: callers outside the runtime must still supply
    credential-free data. Redaction prevents a quoted Bearer example in an old
    message from permanently preventing future turns.
    """
    if isinstance(value, dict):
        return {
            key: redact_checkpoint_data(item)
            for key, item in value.items()
            if re.sub(r'[^a-z0-9]', '', key.lower()) not in _SECRET_KEYS
        }
    if isinstance(value, list):
        return [redact_checkpoint_data(item) for item in value]
    if isinstance(value, str):
        return _SECRET_VALUE.sub('[credencial omitida]', value)
    return value


class CheckpointIncompatible(ValueError):
    """A snapshot exists, but its schema or assistant policy cannot be reused."""


def _validate(value, *, confirmed=False, depth=0):
    if depth > 64:
        raise ValueError('Checkpoint nesting limit exceeded')
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError('Checkpoint keys must be strings')
            normalized = re.sub(r'[^a-z0-9]', '', key.lower())
            if normalized in _SECRET_KEYS:
                raise ValueError('Credentials cannot be checkpointed')
            if confirmed and (
                (normalized in ('error', 'errors') and bool(item))
                or (normalized in ('success', 'ok') and item is False)
                or (normalized == 'status' and item in ('error', 'failed'))
            ):
                raise ValueError('Only confirmed successful reads can be checkpointed')
            _validate(item, confirmed=confirmed, depth=depth + 1)
    elif isinstance(value, list):
        for item in value:
            _validate(item, confirmed=confirmed, depth=depth + 1)
    elif isinstance(value, str):
        if _SECRET_TEXT.search(value):
            raise ValueError('Credentials cannot be checkpointed')
    elif value is not None and type(value) not in (bool, int, float):
        raise ValueError('Checkpoint values must be JSON')


def _encode(value, limit, *, confirmed=False):
    _validate(value, confirmed=confirmed)
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    if len(encoded.encode('utf-8')) > limit:
        raise ValueError('Checkpoint size limit exceeded')
    return encoded


def _decode(value):
    # asyncpg normally returns JSON text; custom pool codecs may return values.
    return json.loads(value) if isinstance(value, str) else value


class CheckpointRepository:
    def __init__(self, pool, tenant_id, user_id, conversation_id, run_id, lease_id,
                 user_message_id, *, policy_version='1'):
        if not isinstance(policy_version, str) or not policy_version or len(policy_version) > 128:
            raise ValueError('Invalid checkpoint policy version')
        self.pool = pool
        self.tenant_id, self.user_id = tenant_id, user_id
        self.conversation_id, self.run_id = conversation_id, run_id
        self.lease_id, self.user_message_id = lease_id, user_message_id
        self.policy_version = policy_version

    @asynccontextmanager
    async def _fenced(self):
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Same conversation -> run order as begin_run/compaction.
                owned = await conn.fetchval('''SELECT id FROM chat_conversations
                    WHERE id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE''',
                    self.conversation_id, self.tenant_id, self.user_id)
                if not owned:
                    raise RunExpired()
                await conn.fetchval('SELECT id FROM chat_response_runs WHERE id=$1 FOR UPDATE', self.run_id)
                # Re-evaluate time after waiting on locks, not in their WHERE.
                valid = await conn.fetchval('''SELECT 1 FROM chat_response_runs
                    WHERE id=$1 AND conversation_id=$2 AND user_message_id=$3
                    AND lease_id=$4 AND status='running' AND lease_until>clock_timestamp()''',
                    self.run_id, self.conversation_id, self.user_message_id, self.lease_id)
                if not valid:
                    raise RunExpired()
                yield conn

    def _versions(self, row):
        if row['schema_version'] != SCHEMA_VERSION or row['policy_version'] != self.policy_version:
            raise CheckpointIncompatible('Checkpoint schema or policy version mismatch')

    async def _require_context(self, conn):
        snapshot = await conn.fetchrow('''SELECT schema_version,policy_version
            FROM chat_turn_checkpoints WHERE conversation_id=$1 AND user_message_id=$2''',
            self.conversation_id, self.user_message_id)
        if snapshot is None:
            raise CheckpointIncompatible('Save context before recording tools')
        self._versions(snapshot)

    async def save_context(self, context: list, history: list):
        if not isinstance(context, list) or not isinstance(history, list):
            raise ValueError('Checkpoint context and history must be lists')
        payload = _encode({'context': context, 'history': history}, MAX_CONTEXT_BYTES)
        # Bound the combined payload, rather than granting each list the limit.
        data = json.loads(payload)
        async with self._fenced() as conn:
            status = await conn.execute('''INSERT INTO chat_turn_checkpoints
                (conversation_id,user_message_id,schema_version,policy_version,context,history)
                VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)
                ON CONFLICT (conversation_id,user_message_id) DO NOTHING''',
                self.conversation_id, self.user_message_id, SCHEMA_VERSION, self.policy_version,
                json.dumps(data['context']), json.dumps(data['history']))
            if status == 'INSERT 0 0':
                await self._require_context(conn)

    async def load_context(self):
        async with self._fenced() as conn:
            row = await conn.fetchrow('''SELECT schema_version,policy_version,context,history
                FROM chat_turn_checkpoints WHERE conversation_id=$1 AND user_message_id=$2''',
                self.conversation_id, self.user_message_id)
            if row is None:
                return None
            self._versions(row)
            context, history = _decode(row['context']), _decode(row['history'])
            if not isinstance(context, list) or not isinstance(history, list):
                raise CheckpointIncompatible('Invalid context checkpoint')
            _encode({'context': context, 'history': history}, MAX_CONTEXT_BYTES)
            return context, history

    def _tool_key(self, name, args):
        if not isinstance(name, str) or name not in READ_ARGUMENTS:
            raise ValueError('Tool is not an allowlisted stable read')
        if not isinstance(args, dict) or not set(args).issubset(READ_ARGUMENTS[name]):
            raise ValueError('Invalid checkpoint tool arguments')
        encoded = _encode(args, 8192)
        return hashlib.sha256(encoded.encode('utf-8')).hexdigest()

    async def record_tool(self, name, args, result):
        """Call only after the read returned successfully; never before execution."""
        key = self._tool_key(name, args)
        encoded = _encode(result, MAX_TOOL_BYTES, confirmed=True)
        async with self._fenced() as conn:
            status = await conn.execute('''INSERT INTO chat_tool_checkpoints
                (conversation_id,user_message_id,tool_name,args_hash,schema_version,policy_version,result)
                SELECT conversation_id,user_message_id,$3,$4,$5,$6,$7::jsonb
                FROM chat_turn_checkpoints WHERE conversation_id=$1 AND user_message_id=$2
                    AND schema_version=$5 AND policy_version=$6
                ON CONFLICT (conversation_id,user_message_id,tool_name,args_hash) DO NOTHING''',
                self.conversation_id, self.user_message_id, name, key, SCHEMA_VERSION, self.policy_version, encoded)
            if status == 'INSERT 0 0':
                # A conflict is legitimate; a missing/incompatible snapshot isn't.
                await self._require_context(conn)

    async def cached_tool(self, name, args):
        key = self._tool_key(name, args)
        async with self._fenced() as conn:
            row = await conn.fetchrow('''SELECT schema_version,policy_version,result
                FROM chat_tool_checkpoints WHERE conversation_id=$1 AND user_message_id=$2
                AND tool_name=$3 AND args_hash=$4''', self.conversation_id, self.user_message_id, name, key)
            if row is None:
                return CACHE_MISS
            self._versions(row)
            result = _decode(row['result'])
            _encode(result, MAX_TOOL_BYTES, confirmed=True)
            return result
