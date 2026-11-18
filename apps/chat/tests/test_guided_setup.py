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


def test_jsonb_text_is_decoded_when_resuming_setup():
    import asyncio

    class Db:
        async def fetchrow(self, *_args):
            return {'step': LOGO, 'answers': '{"businessName":"Loja da Ana"}'}

    assert asyncio.run(GuidedSetup(Db(), 'tenant', 'user').current()) == SetupState(
        LOGO, {'businessName': 'Loja da Ana'}
    )


def test_declined_setup_has_a_terminal_response():
    import asyncio

    class Db:
        async def fetchrow(self, *_args):
            return None

        async def execute(self, *_args):
            pass

    result = asyncio.run(GuidedSetupTools(GuidedSetup(Db(), 'tenant', 'user')).guided_setup_answer('Não'))
    assert result['step'] == DECLINED
    assert result['choices'] == []


def test_replayed_answer_never_repeats_external_context_write():
    import asyncio

    class Setup:
        replayed = False

        async def save_answer(self, _answer):
            result = {'step': COMPANY_PHOTOS, 'answers': {}, 'replayed': self.replayed,
                      'profileUpdate': {'tenantName': 'Loja', 'businessContext': 'Café'}}
            self.replayed = True
            return result

    async def scenario():
        calls = []
        async def writer(*args):
            calls.append(args)
            return {}
        tool = GuidedSetupTools(Setup(), writer)
        assert (await tool.guided_setup_answer('Café'))['contextSaved'] is True
        resumed = await tool.guided_setup_answer('Café')
        assert resumed['contextSaved'] is False
        assert resumed['contextUncertain'] is True
        assert calls == [('Loja', 'Café')]
    asyncio.run(scenario())


def test_only_the_actual_guided_question_authorizes_an_answer():
    from guided_setup import matches_question

    assert matches_question(INVITATION, question_for(INVITATION)['question'])
    assert matches_question(BUSINESS_NAME, question_for(BUSINESS_NAME)['question'])
    assert not matches_question(BUSINESS_NAME, 'Não responda: ' + question_for(BUSINESS_NAME)['question'])
    assert not matches_question(BUSINESS_NAME, question_for(INVITATION)['question'])
    assert not matches_question(INVITATION, '')
    assert not matches_question(INVITATION, None)


def test_tool_rejects_answer_not_matching_the_user_message():
    import asyncio

    class Setup:
        async def save_answer(self, answer):
            return {'step': LOGO, 'answers': {'businessName': answer}}

    async def scenario():
        tool = GuidedSetupTools(Setup(), expected_answer='Loja da Ana')
        assert 'error' in await tool.guided_setup_answer('Loja inventada')
        assert (await tool.guided_setup_answer('Loja da Ana'))['answers']['businessName'] == 'Loja da Ana'
    asyncio.run(scenario())
