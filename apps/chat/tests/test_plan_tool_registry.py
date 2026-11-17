"""Funcionalidade: registrar o gate de criação de planos no agente.

Cenário: pedido novo pode criar rascunho, retomada permanece somente de leitura
Dado uma conversa com ferramentas de plano
Quando o agente recebe as ferramentas para um pedido novo ou uma retomada
Então somente o pedido novo recebe create_plan, sem ferramentas de aprovação.
"""
from plan_tools import PlanTools, tools_for_agent
from typing import cast
import httpx


CONVERSATION_ID = '10000000-0000-4000-8000-000000000001'


def test_create_tool_is_available_only_for_new_requests():
    plans = PlanTools('https://ady.test', 'delegated-test-token', cast(httpx.AsyncClient, object()), CONVERSATION_ID)

    assert [tool.__name__ for tool in tools_for_agent(plans)] == ['create_plan', 'list_plans', 'get_plan']
    assert [tool.__name__ for tool in tools_for_agent(plans, read_only=True)] == ['list_plans', 'get_plan']
