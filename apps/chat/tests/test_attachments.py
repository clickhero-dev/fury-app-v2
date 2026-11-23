"""Funcionalidade: mensagens privadas com anexos (sem provedor externo)."""
from uuid import uuid4

import pytest
from pydantic import ValidationError
from app import MessageInput


# Dado um anexo válido, quando não há texto, então aceita sem inventar fala do usuário.
@pytest.mark.parametrize('content', [None, '', '   '])
def test_attachment_only_message(content):
    aid = str(uuid4())
    payload = {'attachmentIds': [aid]}
    if content is not None:
        payload['content'] = content
    message = MessageInput.model_validate(payload)
    assert message.content == (content if content is not None else '')
    assert [str(value) for value in message.attachmentIds] == [aid]


# Dado entrada inválida, quando valida, então não permite chamada/persistência parcial.
@pytest.mark.parametrize('payload', [
    {}, {'content': ''}, {'content': ' '}, {'content': None}, {'content': 10},
    {'content': 'x' * 20001}, {'content': 'ok', 'attachmentIds': ['not-a-uuid']},
    {'content': 'ok', 'attachmentIds': [str(uuid4())] * 2},
    {'content': 'ok', 'attachmentIds': [str(uuid4()) for _ in range(4)]},
    {'content': 'ok', 'attachmentIds': None},
    {'content': 'ok', 'attachmentIds': 'not-an-array'},
    {'content': 'ok', 'attachmentIds': [uuid4().hex]},
    {'content': 'ok', 'attachmentIds': ['urn:uuid:' + str(uuid4())]},
    {'content': 'ok', 'attachmentIds': [123]},
])
def test_rejects_invalid_message(payload):
    with pytest.raises(ValidationError):
        MessageInput.model_validate(payload)


# Dado o cliente legado, quando envia texto, então continua aceitando 20 mil caracteres.
def test_legacy_text_message():
    assert MessageInput(content='x' * 20000).content == 'x' * 20000
