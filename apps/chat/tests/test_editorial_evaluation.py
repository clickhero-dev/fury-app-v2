"""Offline release gates must not mistake synthetic/unchecked samples for homologation."""
import json

import pytest
from editorial_evaluation import evaluate_samples, load_cases, main


def sample(**changes):
    return {
        'case_id': 'florist_no_idea', 'model': 'vendor/candidate',
        'source': 'live', 'response': 'ADY_MESSAGES:' + json.dumps({
            'messages': ['Legenda: flores para tornar o dia de alguém mais especial.'],
            'clarify': {'question': 'Próximo passo', 'choices': ['Preparar arte', 'Outra ideia']},
        }),
        'tool_calls': ['profile', 'brand'], 'latency_ms': 900,
        'cost_usd': 0.001, 'required_typed_replies': 0, 'outcome': 'completed',
        'human_ratings': {
            'relevance': 5, 'simplicity': 5, 'supported_claims': 5,
            'next_step': 5, 'non_repetition': 5,
        },
        **changes,
    }


def test_real_reviewed_samples_can_pass_only_after_all_cases_are_present():
    cases = load_cases()
    samples = [sample(case_id=case['id']) for case in cases]
    report = evaluate_samples(samples, cases)
    assert report['models']['vendor/candidate']['eligible'] is True
    assert report['models']['vendor/candidate']['case_coverage'] == 1
    assert report['models']['vendor/candidate']['required_typed_replies'] == 0


@pytest.mark.parametrize('change,reason', [
    ({'source': 'synthetic'}, 'synthetic'),
    ({'human_ratings': {}}, 'human_review_missing'),
    ({'human_ratings': {'relevance': 2}}, 'human_review_missing'),
    ({'tool_calls': ['confirm_approval']}, 'unauthorized_effect'),
    ({'response': 'ADY_MESSAGES:broken'}, 'invalid_response'),
    ({'required_typed_replies': 2}, 'cognitive_load'),
])
def test_gate_rejects_unsafe_unreviewed_or_high_effort_samples(change, reason):
    cases = load_cases()
    samples = [sample(case_id=case['id'], **change) for case in cases]
    report = evaluate_samples(samples, cases)
    result = report['models']['vendor/candidate']
    assert result['eligible'] is False
    assert any(reason in failure['reasons'] for failure in result['failures'])


def test_low_human_rating_fails_homologation_without_fake_quality_score():
    cases = load_cases()
    samples = [sample(case_id=case['id']) for case in cases]
    samples[0]['human_ratings']['supported_claims'] = 1
    result = evaluate_samples(samples, cases)['models']['vendor/candidate']
    assert not result['eligible']
    assert 'quality_below_threshold' in result['failures'][0]['reasons']


def test_report_contains_no_prompts_business_data_or_raw_responses():
    cases = load_cases()
    report = evaluate_samples([sample(response='Private customer business information')], cases)
    assert 'Private customer' not in json.dumps(report)
    assert 'response' not in report['models']['vendor/candidate']
    assert report['models']['vendor/candidate']['eligible'] is False


@pytest.mark.parametrize('change', [
    {'latency_ms': -1}, {'latency_ms': float('nan')}, {'cost_usd': -1},
    {'cost_usd': float('inf')}, {'required_typed_replies': True},
    {'case_id': 'unknown'}, {'model': '../../secret'}, {'outcome': 'pretend_success'},
])
def test_invalid_samples_are_rejected(change):
    with pytest.raises(ValueError):
        evaluate_samples([sample(**change)], load_cases())


def test_duplicate_cases_cannot_inflate_coverage():
    report = evaluate_samples([sample(), sample()], load_cases())
    assert report['models']['vendor/candidate']['case_coverage'] < 1
    assert not report['models']['vendor/candidate']['eligible']


def test_failed_and_recovered_samples_are_measured_without_claiming_success():
    cases = load_cases()
    report = evaluate_samples([
        sample(outcome='failed'),
        sample(case_id=cases[1]['id'], outcome='recovered', latency_ms=1800),
    ], cases)
    result = report['models']['vendor/candidate']
    assert result['failure_rate'] == 0.5
    assert result['recovery_rate'] == 0.5
    assert result['completion_rate'] == 0.5


def test_cases_cover_low_context_media_quota_conflicts_and_recovery():
    cases = load_cases()
    assert {'florist_no_idea', 'bakery_missing_context', 'salon_no_integration',
            'photo_unavailable', 'video_quota', 'conflicting_price',
            'provider_recovery', 'weekly_plan'} <= {case['id'] for case in cases}


def test_cli_manifest_does_not_need_api_keys_or_make_network_calls(capsys, monkeypatch):
    monkeypatch.delenv('OPENROUTER_API_KEY', raising=False)
    assert main(['--cases']) == 0
    assert len(json.loads(capsys.readouterr().out)) == len(load_cases())


def test_cli_returns_failed_gate_for_synthetic_results_and_writes_no_raw_content(tmp_path):
    observations = tmp_path / 'private.json'
    report = tmp_path / 'aggregate.json'
    observations.write_text(json.dumps([sample(source='synthetic', response='Private business text')]))
    assert main(['--samples', str(observations), '--output', str(report)]) == 1
    assert 'Private business' not in report.read_text()
    assert not json.loads(report.read_text())['models']['vendor/candidate']['eligible']


def test_cli_invalid_input_is_sanitized(tmp_path, capsys):
    observations = tmp_path / 'private.json'
    observations.write_text('private invalid content')
    with pytest.raises(SystemExit) as caught:
        main(['--samples', str(observations)])
    assert caught.value.code == 2
    assert 'private invalid' not in capsys.readouterr().err


def test_more_than_three_choices_fails_even_if_human_rating_is_high():
    cases = load_cases()
    response = 'ADY_MESSAGES:' + json.dumps({
        'messages': ['Legenda pronta.'],
        'clarify': {'question': 'Próximo passo', 'choices': ['A', 'B', 'C', 'D']},
    })
    report = evaluate_samples([sample(response=response)], cases)
    assert 'too_many_choices' in report['models']['vendor/candidate']['failures'][0]['reasons']
