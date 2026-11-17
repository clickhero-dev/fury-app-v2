"""Funcionalidade: limitar o contexto devolvido por ferramentas
Cenário: mídia inclui dados binários embutidos
Dado que a biblioteca contém imagens em data URL muito extensas
Quando o assistente consulta uma página
Então recebe identificadores e paginação sem conteúdo binário
Cenário: ferramenta devolve conteúdo excessivo
Dado que uma ferramenta retorna um texto muito grande
Quando o agente recebe o resultado
Então o conteúdo é limitado e a redução é informada
"""
import asyncio
import json
import httpx
from tools import AdyTools


def test_biblioteca_nao_envia_binarios_ao_modelo():
    async def run():
        async def handler(request):
            return httpx.Response(200,json={'assets':[{'id':'asset-1','type':'image','url':'data:image/png;base64,'+'A'*900000,'complianceNotes':'B'*900000}], 'total':1,'page':1,'totalPages':1})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result=await AdyTools('https://ady.test','token',client).assets()
        text=json.dumps(result,ensure_ascii=False)
        assert result['assets'][0]['id']=='asset-1'
        assert result['page']==1 and result['total']==1
        assert 'data:image' not in text and len(text.encode())<10000
    asyncio.run(run())


def test_resultado_grande_e_limitado_sem_esconder_reducao():
    from tool_budget import limit_tool_result
    value=limit_tool_result({'items':[{'id':'1','description':'X'*1000000}]})
    text=json.dumps(value,ensure_ascii=False)
    assert len(text.encode()) <= 8192
    assert '1' in text
    assert 'omitid' in text.lower() or 'limitad' in text.lower()


def test_url_extensa_nao_e_devolvida_incompleta():
    from tool_budget import limit_tool_result
    result = limit_tool_result({'url': 'https://example.test/' + 'a' * 1000})
    assert 'omitida' in result['url']
    assert not result['url'].startswith('https://')


def test_agno_envia_resultado_limitado_na_chamada_seguinte():
    from agno.agent import Agent
    from agno.models.openrouter import OpenRouter
    from tool_budget import budget_tool_result

    async def run():
        requests = []
        async def handler(request):
            requests.append(json.loads(request.content))
            if len(requests) == 1:
                message = {'role': 'assistant', 'content': None, 'tool_calls': [
                    {'id': 'call-1', 'type': 'function', 'function': {'name': 'large_result', 'arguments': '{}'}}]}
                finish = 'tool_calls'
            else:
                message, finish = {'role': 'assistant', 'content': 'Concluído.'}, 'stop'
            return httpx.Response(200, json={'id': 'test', 'object': 'chat.completion', 'created': 1, 'model': 'test', 'choices': [{'index': 0, 'message': message, 'finish_reason': finish}]})

        async def large_result() -> dict:
            """Consulta dados externos."""
            return {'id': 'asset-1', 'url': 'data:image/png;base64,' + 'A' * 900000}

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            agent = Agent(model=OpenRouter(id='test', api_key='test', http_client=client), tools=[large_result], tool_hooks=[budget_tool_result], tool_call_limit=12)
            await agent.arun('Consulte a mídia')
        payload = json.dumps(requests[1])
        assert 'asset-1' in payload
        assert 'data:image' not in payload
        assert len(payload) < 20000
    asyncio.run(run())
