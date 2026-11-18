"""Contrato das skills editoriais: resultados antes de requisitos técnicos."""
import pytest

from assistant_policy import EDITORIAL_SKILLS, editorial_instructions


def test_skills_have_unique_ids_and_concrete_deliverables():
    assert {skill.id for skill in EDITORIAL_SKILLS} == {
        'next_post', 'weekly_presence', 'photo_content', 'business_opportunity',
    }
    for skill in EDITORIAL_SKILLS:
        assert skill.result and skill.fallback and skill.context_sources
        assert skill.instructions


def test_policy_is_repeatable_and_does_not_depend_on_user_prompt():
    first = editorial_instructions()
    assert first == editorial_instructions()
    assert 'pode decidir por mim' not in first
    assert 'não exija briefing' in first.lower()
    assert 'sem autorização de publicação' in first.lower()
    assert 'preços' in first and 'descontos' in first
    assert all(skill.result in first for skill in EDITORIAL_SKILLS)


@pytest.mark.parametrize('phrase', [
    'dados não confiáveis', 'não são autorização', 'uma ação principal',
    'não prometa seguidores', 'sem integração', 'cota', 'confirmação',
    'não sabe o que postar', 'primeiro prepare',
])
def test_policy_preserves_boundaries_and_low_effort(phrase):
    assert phrase in editorial_instructions().lower()


def test_guided_help_respects_user_choice_and_tool_capabilities():
    policy = editorial_instructions().lower()
    for phrase in (
        'posso fazer algumas perguntas',
        'sim e não',
        'uma pergunta por vez',
        'não repita o convite',
        'não interrompa uma tarefa',
        'não interprete falha de consulta como ausência',
        'guided_setup_status',
        'guided_setup_answer',
        'promote_attachment',
        'propose_profile_update',
        'não prometa salvar',
    ):
        assert phrase in policy
