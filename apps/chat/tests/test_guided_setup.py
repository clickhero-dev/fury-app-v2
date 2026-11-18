from guided_setup import (
    BUSINESS_NAME, COMPANY_PHOTOS, DECLINED, DONE, INVITATION, LOGO,
    LOGO_CREATION, OFFERING, PRODUCT_PHOTOS, TEAM_PHOTOS, GuidedSetup, GuidedSetupTools, SetupState, advance,
    question_for,
)
import pytest


def test_accepted_setup_advances_one_question_at_a_time_and_preserves_answers():
    state = advance(SetupState(), 'Sim')
    assert state.step == BUSINESS_NAME
    state = advance(state, 'Flores da Ana')
    assert state.step == LOGO
    assert state.answers == {'businessName': 'Flores da Ana'}
    state = advance(state, 'Não tenho')
    assert state.step == LOGO_CREATION
    state = advance(state, 'Continuar sem logo')
    assert state.step == OFFERING
    state = advance(state, 'Flores e presentes')
    assert state.step == COMPANY_PHOTOS
    state = advance(state, 'Pular')
    assert state.step == TEAM_PHOTOS
    state = advance(state, 'Enviar fotos')
    assert state.step == PRODUCT_PHOTOS
    state = advance(state, 'Pular')
    assert state.step == DONE
    assert state.answers == {
        'businessName': 'Flores da Ana', 'logo': 'skipped',
        'offering': 'Flores e presentes', 'companyPhotos': 'skipped',
        'teamPhotos': 'requested', 'productPhotos': 'skipped',
    }


def test_decline_stops_the_optional_flow_without_collecting_data():
    state = advance(SetupState(), 'Não')
    assert state.step == DECLINED
    assert state.answers == {}


@pytest.mark.parametrize('state,answer', [
    (SetupState(INVITATION), 'talvez'),
    (SetupState(BUSINESS_NAME), ' '),
    (SetupState(OFFERING), ''),
    (SetupState(COMPANY_PHOTOS), 'sim'),
])
def test_invalid_answer_does_not_advance(state, answer):
    with pytest.raises(ValueError):
        advance(state, answer)


def test_questions_are_ordinary_language_and_photo_categories_are_separate():
    assert question_for(INVITATION)['choices'] == ['Sim', 'Não']
    assert 'nome do seu negócio' in question_for(BUSINESS_NAME)['question'].lower()
    assert 'empresa' in question_for(COMPANY_PHOTOS)['question'].lower()
    assert 'equipe' in question_for(TEAM_PHOTOS)['question'].lower()
    assert 'serviço ou produto' in question_for(PRODUCT_PHOTOS)['question'].lower()


def test_offering_returns_the_versioned_profile_update_for_authoritative_context():
    import asyncio
    class Db:
        row = None
        async def fetchrow(self, *_args): return self.row
        async def execute(self, _sql, _tenant, _user, step, answers):
            import json
            self.row = {'step': step, 'answers': json.loads(answers)}
    async def exercise():
        setup = GuidedSetup(Db(), 'tenant', 'user')
        await setup.save_answer('Sim')
        await setup.save_answer('Loja da Ana')
        await setup.save_answer('Pular por enquanto')
        result = await setup.save_answer('Flores e presentes')
        assert result['profileUpdate'] == {
            'tenantName': 'Loja da Ana',
            'businessContext': 'Produtos ou serviços: Flores e presentes',
        }
    asyncio.run(exercise())


def test_offering_persists_authoritative_context_before_returning_next_question():
    import asyncio
    class Db:
        row = None
        async def fetchrow(self, *_args): return self.row
        async def execute(self, _sql, _tenant, _user, step, answers):
            import json
            self.row = {'step': step, 'answers': json.loads(answers)}
    saved = []
    async def writer(name, context):
        saved.append((name, context))
        return {'tenantName': name, 'businessContext': context}
    async def exercise():
        setup = GuidedSetupTools(GuidedSetup(Db(), 'tenant', 'user'), writer)
        await setup.guided_setup_answer('Sim')
        await setup.guided_setup_answer('Loja da Ana')
        await setup.guided_setup_answer('Pular por enquanto')
        result = await setup.guided_setup_answer('Flores e presentes')
        assert result['contextSaved'] is True
        assert saved == [('Loja da Ana', 'Produtos ou serviços: Flores e presentes')]
    asyncio.run(exercise())


def test_persistence_is_scoped_to_tenant_and_user_and_keeps_progress():
    class Db:
        def __init__(self):
            self.rows = {}

        async def fetchrow(self, _sql, tenant, user):
            return self.rows.get((tenant, user))

        async def execute(self, _sql, tenant, user, step, answers):
            import json
            self.rows[(tenant, user)] = {'step': step, 'answers': json.loads(answers)}

    async def exercise():
        db = Db()
        first = GuidedSetup(db, 'tenant-a', 'user-a')
        other = GuidedSetup(db, 'tenant-b', 'user-a')
        assert (await first.save_answer('Sim'))['step'] == BUSINESS_NAME
        assert (await first.save_answer('Loja A'))['step'] == LOGO
        assert (await other.current()).step == INVITATION
        resumed = await first.current()
        assert resumed == SetupState(LOGO, {'businessName': 'Loja A'})

    import asyncio
    asyncio.run(exercise())


def test_missing_optional_setup_table_does_not_block_normal_chat():
    import asyncio
    import asyncpg

    class Db:
        async def fetchrow(self, *_args):
            raise asyncpg.UndefinedTableError('chat_guided_setups')

    assert asyncio.run(GuidedSetup(Db(), 'tenant', 'user').current()) == SetupState()
