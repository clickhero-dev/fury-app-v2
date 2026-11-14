"""Funcionalidade: respostas estruturadas não confundem parágrafos com mensagens."""
import pytest
from response_messages import split_response, parse_response


def test_clarification_requires_two_to_five_distinct_nonempty_choices():
    text = 'ADY_MESSAGES:{"messages":["Me diga:"],"clarify":{"question":"Qual?","choices":["Um","Dois"]}}'
    assert parse_response(text) == (['Me diga:'], {'question':'Qual?', 'choices':['Um','Dois']})
    for choices in ([], ['Um'], ['A','a'], ['A',''], ['1','2','3','4','5','6']):
        import json
        with pytest.raises(ValueError):
            parse_response('ADY_MESSAGES:' + json.dumps({'messages':['x'],'clarify':{'question':'Qual?','choices':choices}}))


def test_explicit_response_is_split_in_order():
    assert split_response('ADY_MESSAGES:{"messages":["Primeira", "Segunda"]}') == ['Primeira', 'Segunda']


def test_plain_paragraphs_remain_one_message():
    assert split_response('Um parágrafo.\n\nOutro parágrafo.') == ['Um parágrafo.\n\nOutro parágrafo.']


@pytest.mark.parametrize('body', [
    'ADY_MESSAGES:{"messages":[]}',
    'ADY_MESSAGES:{"messages":["ok", "  "]}',
    'ADY_MESSAGES:{"messages":["x", 1]}',
    'ADY_MESSAGES:{"messages":["x", "x", "x", "x", "x", "x"]}',
    'ADY_MESSAGES:not-json',
])
def test_invalid_structured_response_is_rejected(body):
    with pytest.raises(ValueError):
        split_response(body)
