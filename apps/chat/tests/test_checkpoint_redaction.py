import pytest

from checkpoints import redact_checkpoint_data, _encode, MAX_CONTEXT_BYTES


@pytest.mark.parametrize('secret', [
    'Bearer private-example',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signature',
    'https://example.invalid/photo?access_token=private-example&size=small',
    'https://example.invalid/photo?X-Amz-Signature=private-example',
    'https://example.invalid/photo?token=private-example',
    'https://example.invalid/photo?api_key=private-example',
])
def test_redacted_data_is_accepted_by_strict_repository(secret):
    original = [{'role': 'user', 'content': secret}]
    result = redact_checkpoint_data(original)
    assert result != original
    assert original[0]['content'] == secret
    assert 'private-example' not in str(result)
    assert '[credencial omitida]' in str(result)
    _encode(result, MAX_CONTEXT_BYTES)


def test_nested_credential_fields_are_removed_without_mutating_source():
    original = {'data': [{'name': 'Flores', 'access_token': 'private', 'Authorization': 'Bearer private'}]}
    result = redact_checkpoint_data(original)
    assert result == {'data': [{'name': 'Flores'}]}
    assert original['data'][0]['access_token'] == 'private'
    _encode(result, MAX_CONTEXT_BYTES)


def test_ordinary_domain_values_are_preserved():
    original = [{'topic': 'negócio', 'text': 'Vendo flores', 'count': 3, 'enabled': True, 'none': None}]
    assert redact_checkpoint_data(original) == original
