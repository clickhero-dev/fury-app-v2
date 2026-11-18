"""Fluxo durável e opcional para conhecer o negócio sem virar um formulário."""
import json
from dataclasses import dataclass
from typing import Any


INVITATION = 'invitation'
DECLINED = 'declined'
BUSINESS_NAME = 'business_name'
LOGO = 'logo'
LOGO_CREATION = 'logo_creation'
OFFERING = 'offering'
COMPANY_PHOTOS = 'company_photos'
TEAM_PHOTOS = 'team_photos'
PRODUCT_PHOTOS = 'product_photos'
DONE = 'done'


@dataclass(frozen=True)
class SetupState:
    step: str = INVITATION
    answers: dict[str, Any] | None = None


def question_for(step: str) -> dict[str, Any]:
    questions = {
        INVITATION: {'question': 'Posso fazer algumas perguntas sobre seu negócio para dar sugestões mais úteis?', 'choices': ['Sim', 'Não']},
        BUSINESS_NAME: {'question': 'Qual é o nome do seu negócio?', 'choices': []},
        LOGO: {'question': 'Você tem uma logomarca?', 'choices': ['Sim, vou enviar', 'Não tenho', 'Pular por enquanto']},
        LOGO_CREATION: {'question': 'Gostaria de criar uma logomarca agora?', 'choices': ['Criar logomarca', 'Continuar sem logo']},
        OFFERING: {'question': 'Que produto ou serviço você vende?', 'choices': []},
        COMPANY_PHOTOS: {'question': 'Quer me mandar fotos da sua empresa?', 'choices': ['Enviar fotos', 'Pular']},
        TEAM_PHOTOS: {'question': 'Quer me mandar fotos da sua equipe?', 'choices': ['Enviar fotos', 'Pular']},
        PRODUCT_PHOTOS: {'question': 'Quer mandar fotos do seu serviço ou produto?', 'choices': ['Enviar fotos', 'Pular']},
        DONE: {'question': 'Pronto! Salvei o que foi confirmado e já posso usar essas informações nas próximas sugestões.', 'choices': []},
    }
    return questions[step]


def normalize(value: str) -> str:
    return ' '.join(value.strip().casefold().split())


def advance(state: SetupState, answer: str) -> SetupState:
    """Valida uma resposta e avança exatamente uma etapa, sem inferir fatos."""
    value = answer.strip()
    normalized = normalize(value)
    answers = dict(state.answers or {})
    if state.step == INVITATION:
        if normalized in ('sim', 's'):
            return SetupState(BUSINESS_NAME, answers)
        if normalized in ('não', 'nao', 'n'):
            return SetupState(DECLINED, answers)
    elif state.step == BUSINESS_NAME:
        if 1 <= len(value) <= 255:
            answers['businessName'] = value
            return SetupState(LOGO, answers)
    elif state.step == LOGO:
        if normalized in ('sim, vou enviar', 'sim'):
            answers['logo'] = 'awaiting_upload'
            return SetupState(OFFERING, answers)
        if normalized == 'não tenho' or normalized == 'nao tenho':
            return SetupState(LOGO_CREATION, answers)
        if normalized == 'pular por enquanto':
            answers['logo'] = 'skipped'
            return SetupState(OFFERING, answers)
    elif state.step == LOGO_CREATION:
        if normalized == 'criar logomarca':
            answers['logo'] = 'creation_requested'
            return SetupState(OFFERING, answers)
        if normalized == 'continuar sem logo':
            answers['logo'] = 'skipped'
            return SetupState(OFFERING, answers)
    elif state.step == OFFERING:
        if 1 <= len(value) <= 5000:
            answers['offering'] = value
            return SetupState(COMPANY_PHOTOS, answers)
    elif state.step in (COMPANY_PHOTOS, TEAM_PHOTOS, PRODUCT_PHOTOS):
        if normalized not in ('enviar fotos', 'pular'):
            raise ValueError('Escolha Enviar fotos ou Pular.')
        key = {COMPANY_PHOTOS: 'companyPhotos', TEAM_PHOTOS: 'teamPhotos', PRODUCT_PHOTOS: 'productPhotos'}[state.step]
        answers[key] = 'requested' if normalized == 'enviar fotos' else 'skipped'
        next_step = {COMPANY_PHOTOS: TEAM_PHOTOS, TEAM_PHOTOS: PRODUCT_PHOTOS, PRODUCT_PHOTOS: DONE}[state.step]
        return SetupState(next_step, answers)
    raise ValueError('Essa resposta não é válida para a etapa atual.')


class GuidedSetup:
    """Persistência isolada por tenant/usuário; cada avanço é atômico."""
    def __init__(self, db, tenant_id: str, user_id: str):
        self.db, self.tenant_id, self.user_id = db, tenant_id, user_id

    async def current(self) -> SetupState:
        row = await self.db.fetchrow(
            'SELECT step,answers FROM chat_guided_setups WHERE tenant_id=$1 AND user_id=$2',
            self.tenant_id, self.user_id,
        )
        if row is None or row.get('step') not in {
            INVITATION, DECLINED, BUSINESS_NAME, LOGO, LOGO_CREATION, OFFERING,
            COMPANY_PHOTOS, TEAM_PHOTOS, PRODUCT_PHOTOS, DONE,
        }:
            return SetupState()
        return SetupState(row['step'], dict(row['answers'] or {}))

    async def save_answer(self, answer: str) -> dict[str, Any]:
        state = await self.current()
        next_state = advance(state, answer)
        await self.db.execute(
            '''INSERT INTO chat_guided_setups(tenant_id,user_id,step,answers,updated_at)
               VALUES($1,$2,$3,$4::jsonb,clock_timestamp())
               ON CONFLICT(tenant_id,user_id) DO UPDATE SET step=EXCLUDED.step,
                 answers=EXCLUDED.answers,updated_at=EXCLUDED.updated_at''',
            self.tenant_id, self.user_id, next_state.step, json.dumps(next_state.answers or {}),
        )
        result = {'step': next_state.step, 'answers': next_state.answers or {}, **question_for(next_state.step)}
        if next_state.answers and next_state.answers.get('businessName') and next_state.answers.get('offering'):
            result['profileUpdate'] = {
                'tenantName': next_state.answers['businessName'],
                'businessContext': f"Produtos ou serviços: {next_state.answers['offering']}",
            }
        return result


class GuidedSetupTools:
    def __init__(self, setup: GuidedSetup):
        self.setup = setup

    async def guided_setup_status(self) -> dict[str, Any]:
        """Consultar a etapa atual da ajuda de configuração do negócio."""
        state = await self.setup.current()
        return {'step': state.step, 'answers': state.answers or {}, **question_for(state.step)}

    async def guided_setup_answer(self, answer: str) -> dict[str, Any]:
        """Salvar uma resposta do fluxo guiado e obter somente a próxima pergunta.

        Use exclusivamente após o usuário responder à pergunta atual. Não use para
        inventar respostas, e não avance mais de uma etapa por mensagem.
        """
        if not isinstance(answer, str):
            return {'error': 'Resposta inválida.'}
        try:
            return await self.setup.save_answer(answer)
        except ValueError as error:
            return {'error': str(error), **(await self.guided_setup_status())}
