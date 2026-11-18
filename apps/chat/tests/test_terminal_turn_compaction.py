"""An exhausted/failed turn must not poison compaction of later successful work."""
import asyncio
import json
import os

import pytest

from attachment_repository import AttachmentRepository
from checkpoints import CheckpointRepository
from conversation_repository import ConversationRepository
from memory import consolidate
from runs import FencedDB
from test_attachments_postgres import database

pytestmark = pytest.mark.skipif(not os.getenv('CHAT_MEDIA_TEST_DATABASE_URL'), reason='isolated PostgreSQL required')


@pytest.mark.parametrize('use_repository', [True, False])
def test_failed_turn_does_not_block_later_compaction_or_lose_its_checkpoint(use_repository):
    async def run():
        async with database() as (pool, tenant, user, cid):
            repo = ConversationRepository(pool, tenant, user)
            interrupted, lease, failed_message = await repo.begin_run(cid, 'Pedido preservado após falha')
            await CheckpointRepository(pool, tenant, user, cid, interrupted, lease, failed_message).save_context(
                [], [{'role': 'user', 'content': 'Pedido preservado após falha'}],
            )
            await pool.execute("UPDATE chat_response_runs SET status='failed' WHERE id=$1", interrupted)
            for index in range(2):
                completed, completed_lease, _ = await repo.begin_run(cid, f'Pedido concluído {index}')
                await FencedDB(pool, completed, completed_lease).complete(cid, f'Resposta concluída {index}')
            current, current_lease, current_message = await repo.begin_run(cid, 'Continuar nesta conversa')
            captured = []
            async def summarize(previous, messages):
                captured.extend(messages)
                return json.dumps({'facts': [{'topic': 'trabalho', 'text': 'Duas entregas confirmadas'}]})
            assert await consolidate(
                pool, cid, summarize, min_responses=2,
                message_repository=AttachmentRepository(pool, tenant, user) if use_repository else None,
                owner_run=(current, current_lease, current_message),
            )
            assert [message['content'] for message in captured] == [
                'Pedido concluído 0', 'Resposta concluída 0',
                'Pedido concluído 1', 'Resposta concluída 1',
            ]
            assert await pool.fetchval('SELECT content FROM chat_messages WHERE id=$1', failed_message) == 'Pedido preservado após falha'
            assert await pool.fetchval('SELECT count(*) FROM chat_turn_checkpoints WHERE user_message_id=$1', failed_message) == 1
            assert await pool.fetchval('SELECT count(*) FROM chat_response_runs WHERE id=$1', interrupted) == 1
    asyncio.run(run())
