"""Operações puras sobre fatos e suas origens."""

def remove_conversation(memory: dict, conversation_id: str) -> dict:
    facts = []
    for fact in memory.get('facts', []):
        remaining = [source for source in fact.get('sources', []) if source != conversation_id]
        if remaining:
            facts.append({**fact, 'sources': remaining})
    return {**memory, 'facts': facts}


def conversation_context(history):
    from agno.models.message import Message
    return [Message(role=item['role'], content=item['content']) for item in history]


def parse_summary(content: str) -> list[dict]:
    import json
    try:
        data = json.loads(content)
        facts = data['facts']
        if not isinstance(facts, list) or len(facts) > 200:
            raise ValueError('Invalid facts')
        if any(not isinstance(f, dict) or not isinstance(f.get('topic'), str) or not isinstance(f.get('text'), str) or not f['topic'].strip() or not f['text'].strip() or len(f['topic']) > 200 or len(f['text']) > 4000 for f in facts):
            raise ValueError('Invalid fact')
        return [{'topic': f['topic'], 'text': f['text']} for f in facts]
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError('Invalid memory summary') from exc


SUMMARY_INPUT_TOKEN_BUDGET = 40_000
MAX_SUMMARY_RESPONSES_PER_BATCH = 5
MAX_CONTEXT_COMPACTION_BATCHES = 12


class ContextBudgetExceeded(ValueError):
    """Raised before a model call or prune when a safe summary cannot be formed."""


def _summary_payload_tokens(previous, messages):
    import json
    payload = {
        'previous': previous,
        'messages': [{'role': row['role'], 'content': row['content']} for row in messages],
    }
    return count_tokens(json.dumps(payload, ensure_ascii=False)) + 4096 + 16 * (2 + len(messages))


def _fact_batches(facts):
    batches, current = [], []
    for fact in facts:
        candidate = current + [fact]
        if _summary_payload_tokens(candidate, []) <= SUMMARY_INPUT_TOKEN_BUDGET:
            current = candidate
            continue
        if current:
            batches.append(current)
        current = [fact]
        if _summary_payload_tokens(current, []) > SUMMARY_INPUT_TOKEN_BUDGET:
            raise ContextBudgetExceeded('Um fato excede o limite seguro para resumo.')
    if current:
        batches.append(current)
    return batches


async def _summarize_facts_bounded(facts, summarize, *, force=False):
    import asyncio
    import json
    current = list(facts)
    for _ in range(4):
        if not current:
            return []
        batches = _fact_batches(current)
        if not force and len(batches) == 1:
            return current
        compacted = []
        for batch in batches:
            result = parse_summary(await asyncio.wait_for(summarize(batch), timeout=30))
            if not result:
                raise ValueError('Empty summary cannot replace memory')
            compacted.extend(result)
        if len(json.dumps(compacted, ensure_ascii=False)) >= len(json.dumps(current, ensure_ascii=False)):
            raise ValueError('Compressão não reduziu memória')
        current = compacted
        force = False
    if _summary_payload_tokens(current, []) > SUMMARY_INPUT_TOKEN_BUDGET:
        raise ContextBudgetExceeded('Memória excede o limite seguro após compactação.')
    return current


async def consolidate(pool, conversation_id, summarize, min_responses=5, message_repository=None, *, owner_run=None):
    """Resume lotes limitados; só grava se o resumo e o snapshot forem válidos."""
    import json
    import asyncio
    query = """SELECT id,role,content FROM chat_messages WHERE conversation_id=$1 AND (created_at,id) <= (SELECT created_at,id FROM chat_messages WHERE conversation_id=$1 AND role='assistant' ORDER BY created_at,id OFFSET $2 LIMIT 1) ORDER BY created_at,id"""

    async def snapshot(conn, response_count, lock=False):
        if message_repository:
            return await message_repository.summary_rows(conn, conversation_id, response_count, lock=lock)
        return await conn.fetch(query + (' FOR UPDATE' if lock else ''), conversation_id, response_count - 1)

    async with pool.acquire() as conn:
        previous_raw = await conn.fetchval('SELECT facts FROM chat_memories WHERE conversation_id=$1', conversation_id)
        previous_original = json.loads(previous_raw) if previous_raw else []

    previous = await _summarize_facts_bounded(previous_original, lambda facts: summarize(facts, []))
    requested = min(max(1, min_responses), MAX_SUMMARY_RESPONSES_PER_BATCH)
    async with pool.acquire() as conn:
        rows = None
        selected_responses = 0
        has_complete_batch = False
        for response_count in range(requested, 0, -1):
            candidate = await snapshot(conn, response_count)
            if owner_run and candidate:
                # Never summarize turns that occurred after this request's input.
                after_cutoff = await conn.fetchval('''SELECT EXISTS (SELECT 1 FROM chat_messages m
                    WHERE m.conversation_id=$1 AND m.id=ANY($2::uuid[])
                    AND (m.created_at,m.id) >= (SELECT created_at,id FROM chat_messages WHERE id=$3 AND conversation_id=$1))''',
                    conversation_id, [r['id'] for r in candidate], owner_run[2])
                if after_cutoff:
                    continue
            users = [row['id'] for row in candidate if row['role'] == 'user']
            assistants = [row['id'] for row in candidate if row['role'] == 'assistant']
            if len(users) != response_count or len(assistants) != response_count:
                continue
            if [row['role'] for row in candidate] != ['user', 'assistant'] * response_count:
                # Interleaved turns are safe only when every selected message is
                # paired to a completed run inside the same snapshot.
                paired = await conn.fetchval('''SELECT count(DISTINCT user_message_id)=$4
                    AND count(DISTINCT assistant_message_id)=$4 FROM chat_response_runs
                    WHERE conversation_id=$1 AND status='completed'
                    AND user_message_id=ANY($2::uuid[]) AND assistant_message_id=ANY($3::uuid[])''',
                    conversation_id, users, assistants, response_count)
                if not paired:
                    continue
            has_complete_batch = True
            if _summary_payload_tokens(previous, candidate) <= SUMMARY_INPUT_TOKEN_BUDGET:
                rows = candidate
                selected_responses = response_count
                break
        if rows is None:
            if has_complete_batch:
                raise ContextBudgetExceeded('O contexto excede o limite seguro para resumo.')
            return False

    facts = parse_summary(await asyncio.wait_for(summarize(previous, [dict(row) for row in rows]), timeout=30))
    if not facts:
        raise ValueError('Empty summary cannot replace messages')
    if _summary_payload_tokens(facts, []) > SUMMARY_INPUT_TOKEN_BUDGET:
        raise ContextBudgetExceeded('O resumo excede o limite seguro de contexto.')
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', str(conversation_id))
            # Beginning/completing a run uses this same row lock. Do not rewrite
            # history or memory underneath any in-flight request.
            await conn.fetchval('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE', conversation_id)
            if owner_run:
                valid = await conn.fetchval("SELECT 1 FROM chat_response_runs WHERE id=$1 AND lease_id=$2 AND user_message_id=$3 AND conversation_id=$4 AND status='running' AND lease_until>clock_timestamp() FOR UPDATE", *owner_run, conversation_id)
                if not valid:
                    return False
            if await conn.fetchval("SELECT 1 FROM chat_response_runs WHERE conversation_id=$1 AND status='running' AND lease_until>clock_timestamp() AND ($2::uuid IS NULL OR id<>$2) LIMIT 1", conversation_id, owner_run[0] if owner_run else None):
                return False
            current = await snapshot(conn, selected_responses, lock=True)
            current_raw = await conn.fetchval('SELECT facts FROM chat_memories WHERE conversation_id=$1 FOR UPDATE', conversation_id)
            if [dict(row) for row in current] != [dict(row) for row in rows] or (json.loads(current_raw) if current_raw else []) != previous_original:
                return False
            await conn.execute('INSERT INTO chat_memories(conversation_id,facts) VALUES($1,$2::jsonb) ON CONFLICT(conversation_id) DO UPDATE SET facts=EXCLUDED.facts,updated_at=now()', conversation_id, json.dumps(facts))
            message_ids = [row['id'] for row in rows]
            if message_repository:
                await message_repository.prune_summarized(conn, conversation_id, message_ids)
            else:
                await conn.execute('DELETE FROM chat_messages WHERE conversation_id=$1 AND id=ANY($2::uuid[])', conversation_id, message_ids)
            return True


def requires_compression(estimated_tokens: int) -> bool:
    return estimated_tokens >= 50_000


async def compress_memories(pool, tenant_id, user_id, summarize):
    """Condensa cada origem sem segurar conexão durante chamadas ao modelo."""
    import json
    query = 'SELECT m.conversation_id,m.facts FROM chat_memories m JOIN chat_conversations c ON c.id=m.conversation_id WHERE c.tenant_id=$1 AND c.user_id=$2 ORDER BY m.conversation_id'
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, tenant_id, user_id)
    updates = []
    for row in rows:
        old = json.loads(row['facts'])
        if not old:
            continue
        new = await _summarize_facts_bounded(old, summarize, force=True)
        if not new or len(json.dumps(new)) >= len(json.dumps(old)):
            raise ValueError('Compressão não reduziu memória')
        updates.append((row['conversation_id'], old, new))
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetch(query + ' FOR UPDATE OF m', tenant_id, user_id)
            original = [(r['conversation_id'], json.loads(r['facts'])) for r in rows]
            actual = [(r['conversation_id'], json.loads(r['facts'])) for r in current]
            if actual != original:
                raise ValueError('Memória mudou durante compressão')
            for conversation_id, _old, new in updates:
                await conn.execute('UPDATE chat_memories SET facts=$2::jsonb,updated_at=now() WHERE conversation_id=$1', conversation_id, json.dumps(new))


from functools import lru_cache
from pathlib import Path

@lru_cache(maxsize=1)
def tokenizer():
    from tokenizers import Tokenizer
    return Tokenizer.from_file(str(Path(__file__).parent / 'tokenizer' / 'tokenizer.json'))


def count_tokens(text: str) -> int:
    return len(tokenizer().encode(text, add_special_tokens=False).ids)


def estimate_request_tokens(instructions, history, tools, counter=count_tokens):
    """Estima instruções, mensagens e schemas Agno com reserva de resposta e framing."""
    import json
    from agno.tools import Function
    schemas = [(tool if isinstance(tool, Function) else Function.from_callable(tool)).to_dict() for tool in tools]
    request = {'instructions':instructions, 'messages':[dict(row) for row in history], 'tools':schemas}
    return counter(json.dumps(request, ensure_ascii=False)) + 4096 + 16 * (len(instructions) + len(history) + len(tools))
