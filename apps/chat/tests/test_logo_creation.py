import asyncio
import json
from datetime import datetime, timezone
from uuid import uuid4

from tools import ImageProposal


def test_logo_creation_is_an_image_approval_that_requests_automatic_brand_save():
    async def run():
        class Db:
            async def fetchrow(self, _query, *args):
                body = json.loads(args[3])
                assert body['save_as_logo'] is True
                assert body['aspect_ratio'] == '1:1'
                assert body['resolution'] == '1K'
                assert 'Flores da Ana' in body['prompt']
                return {'id': uuid4(), 'expires_at': datetime.now(timezone.utc)}
        result = await ImageProposal(Db(), 'tenant', 'user', 'conversation').propose_logo_creation('Flores da Ana', 'delicada')
        assert result['action'] == 'Criar imagem'
        assert result['status'] == 'pending'
    asyncio.run(run())


def test_logo_creation_rejects_empty_business_name_without_creating_approval():
    async def run():
        class Db:
            async def fetchrow(self, *_args):
                raise AssertionError('não deve criar aprovação')
        result = await ImageProposal(Db(), 'tenant', 'user', 'conversation').propose_logo_creation('')
        assert 'error' in result
    asyncio.run(run())
