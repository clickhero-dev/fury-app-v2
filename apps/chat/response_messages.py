"""Explicit, bounded model response envelope; legacy plain text stays intact."""
import json

PREFIX = 'ADY_MESSAGES:'
MAX_MESSAGES = 5
MAX_MESSAGE_LENGTH = 20000
MAX_RESPONSE_LENGTH = 110000


def validate_clarification(value):
    if not isinstance(value, dict) or set(value) != {'question', 'choices'}:
        raise ValueError('Esclarecimento inválido')
    question, choices = value['question'], value['choices']
    if (not isinstance(question, str) or not question.strip() or len(question) > 500
            or not isinstance(choices, list) or not 2 <= len(choices) <= 5
            or any(not isinstance(choice, str) or not choice.strip() or len(choice) > 200 for choice in choices)
            or len(set(choice.strip().casefold() for choice in choices)) != len(choices)):
        raise ValueError('Esclarecimento inválido')
    return {'question': question.strip(), 'choices': [choice.strip() for choice in choices]}


def split_response(text):
    return parse_response(text)[0]


def parse_response(text):
    if not isinstance(text, str) or not text.strip():
        raise ValueError('Resposta vazia')
    structured_text = text.lstrip()
    if not structured_text.startswith(PREFIX):
        if len(text) > MAX_RESPONSE_LENGTH:
            raise ValueError('Resposta longa demais')
        return [text], None
    try:
        payload = json.loads(structured_text[len(PREFIX):])
    except (ValueError, TypeError) as error:
        raise ValueError('Resposta estruturada inválida') from error
    messages = payload.get('messages') if isinstance(payload, dict) else None
    if (not isinstance(payload, dict) or not set(payload) in ({'messages'}, {'messages', 'clarify'})
            or not isinstance(messages, list) or not 1 <= len(messages) <= MAX_MESSAGES
            or any(not isinstance(item, str) or not item.strip() or len(item) > MAX_MESSAGE_LENGTH for item in messages)):
        raise ValueError('Resposta estruturada inválida')
    return messages, validate_clarification(payload['clarify']) if 'clarify' in payload else None
