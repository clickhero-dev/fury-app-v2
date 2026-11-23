"""Funcionalidade: classificar apenas recusas comprovadas
Cenário: código e status conhecidos geram cópia fixa
Dado um erro da API com código conhecido
Quando classifica HTTP403
Então retorna somente a mensagem do catálogo
Cenário: corpo arbitrário não é diagnóstico
Dado outro status, código, formato ou texto malicioso
Quando classifica
Então mantém resultado incerto sem ecoar dados externos
"""
import pytest

from action_outcomes import ActionOutcomes

MESSAGES = {
    'VIDEO_NOT_IN_PLAN': 'A criação de vídeos não está disponível no seu plano atual.',
    'VIDEO_QUOTA_EXCEEDED': 'O limite de criação de vídeos deste período foi atingido.',
    'MODIFICATION_QUOTA_EXCEEDED': 'O limite de alterações deste vídeo foi atingido.',
    'SERVICE_BLOCKED': 'Esta ação não está disponível para sua conta.',
}


@pytest.mark.parametrize('code,message', MESSAGES.items())
def test_known_codes_have_only_fixed_copy(code, message):
    refusal = ActionOutcomes.classify(403, {'error': {'code': code, 'message': 'private provider credits <script>'}})
    assert refusal is not None
    assert refusal.detail() == {'status': 'failed', 'code': code, 'message': message}
    assert refusal.result() == {'code': code, 'error': message}


@pytest.mark.parametrize('status', [200, 400, 401, 404, 409, 429, 500, 502, 503])
def test_known_code_with_wrong_http_status_is_not_classified(status):
    assert ActionOutcomes.classify(status, {'error': {'code': 'VIDEO_NOT_IN_PLAN'}}) is None


@pytest.mark.parametrize('payload', [None, [], 'VIDEO_NOT_IN_PLAN', {}, {'code': 'VIDEO_NOT_IN_PLAN'},
    {'detail': {'code': 'VIDEO_NOT_IN_PLAN'}}, {'error': 'VIDEO_NOT_IN_PLAN'},
    {'error': {'code': ['VIDEO_NOT_IN_PLAN']}}, {'error': {'code': 'video_not_in_plan'}},
    {'error': {'code': 'VIDEO_NOT_IN_PLAN '}}, {'error': {'code': 'PROVIDER_CREDITS'}},
    {'error': {'message': 'VIDEO_NOT_IN_PLAN secret'}}])
def test_untrusted_payload_cannot_supply_a_diagnosis(payload):
    assert ActionOutcomes.classify(403, payload) is None
