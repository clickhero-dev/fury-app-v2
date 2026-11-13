"""Funcionalidade: memória inteligente
Cenário: informações preservam sua origem
Dado um fato associado a duas conversas
Quando uma delas é excluída
Então o fato permanece associado à outra
Cenário: fato sem origem restante é removido
Dado um fato associado somente à conversa excluída
Quando a conversa é excluída
Então o fato é removido
Cenário: memória grande é resumida em entradas limitadas
Dado uma conversa com muitos fatos
Quando suas memórias precisam ser compactadas
Então cada entrada ao resumidor permanece dentro do orçamento
"""
from memory import remove_conversation

def test_remove_one_source():
    memory = {'facts': [{'text': 'gosta de café', 'sources': ['one', 'two']}]}
    assert remove_conversation(memory, 'one') == {'facts': [{'text': 'gosta de café', 'sources': ['two']}]}

def test_remove_last_source():
    memory = {'facts': [{'text': 'gosta de café', 'sources': ['one']}]}
    assert remove_conversation(memory, 'one') == {'facts': []}

# Cenário: contexto usa mensagens da conversa na ordem
# Dado um histórico de mensagens
# Quando o contexto é preparado
# Então os papéis e conteúdos são preservados

def test_conversation_context():
    from memory import conversation_context
    history = [{'role': 'user', 'content': 'Olá'}, {'role': 'assistant', 'content': 'Oi'}]
    messages = conversation_context(history)
    assert [(m.role, m.content) for m in messages] == [('user', 'Olá'), ('assistant', 'Oi')]

# Cenário: resumos inválidos não substituem a memória
# Dado uma resposta de resumo sem lista de fatos válida
# Quando é validada
# Então ocorre erro e as mensagens originais são preservadas

def test_invalid_summary_rejected():
    from memory import parse_summary
    import pytest
    with pytest.raises(ValueError):
        parse_summary('{"facts": "inválido"}')

# Cenário: cada fato resumido fica vinculado à conversa de origem
# Dado um resumo estruturado válido
# Quando é validado
# Então seus fatos são associados à conversa de origem

def test_summary_provenance():
    from memory import parse_summary
    assert parse_summary('{"facts":[{"topic":"marca","text":"vende café"}]}') == [{'topic':'marca','text':'vende café'}]

# Cenário: memória extensa é identificada para compressão
# Dado conteúdo estimado em 50 mil tokens
# Quando o limite do contexto é verificado
# Então a compressão é necessária

def test_context_limit():
    from memory import requires_compression
    assert requires_compression(50000)
    assert not requires_compression(49999)

# Cenário: contexto é contado com tokenizer nativo do modelo
# Dado texto em português
# Quando mede tokens
# Então utiliza os mesmos ids gerados pelo tokenizer DeepSeek V4

def test_native_token_count():
    from memory import count_tokens, tokenizer
    text = 'Olá, como vai a campanha de café?'
    assert count_tokens(text) == len(tokenizer().encode(text).ids)
    assert count_tokens(text) < len(text.encode('utf-8'))

# Cenário: contexto atinge limite de 50 mil tokens
# Dado contagem exata do conteúdo
# Quando alcança o limite
# Então a compressão deve ser acionada
# Cenário: histórico longo é consolidado em lotes limitados
# Dado muitas interações persistidas
# Quando a consolidação é solicitada para o histórico inteiro
# Então o resumidor recebe apenas um lote dentro do orçamento

def test_native_token_threshold():
    from memory import requires_compression
    assert not requires_compression(49999)
    assert requires_compression(50000)

# Cenário: texto longo aciona a compressão pelo total de tokens
# Dado um contexto com mais de 50 mil tokens nativos
# Quando mede o contexto
# Então aciona a compressão

def test_long_context_native_tokens():
    from memory import count_tokens, requires_compression
    text = (' café' * 51000)
    assert requires_compression(count_tokens(text))

# Cenário: limite considera instruções e ferramentas além do histórico
# Dado uma requisição com schemas e reserva para resposta
# Quando estima o contexto
# Então ativa compressão antes de ultrapassar 50 mil tokens

def test_request_budget_preserves_agno_function_and_callable_schemas():
    import json
    from agno.tools import Function
    from memory import estimate_request_tokens

    def ordinary_tool(query: str) -> str:
        """Search using a query."""
        return query

    plan_tool = Function(name='make_plan', description='Create a plan', parameters={
        'type': 'object', 'properties': {'steps': {'type': 'array', 'items': {'type': 'string'}}},
        'required': ['steps'],
    })
    captured = []
    result = estimate_request_tokens(['hello'], [{'role': 'user', 'content': 'test'}],
        [plan_tool, ordinary_tool], counter=lambda text: captured.append(text) or len(text))
    payload = json.loads(captured[0])
    assert payload['tools'] == [plan_tool.to_dict(), Function.from_callable(ordinary_tool).to_dict()]
    assert result == len(captured[0]) + 4096 + 16 * 4


def test_request_budget_includes_schema_and_response_reserve():
    from memory import estimate_request_tokens, requires_compression
    from tools import ImageProposal
    tool = ImageProposal(None,None,None,None).propose_video
    captured = []
    def count(text):
        captured.append(text)
        return 45900
    total = estimate_request_tokens(['instrução'], [{'role':'user','content':'texto'}], [tool], counter=count)
    assert 'propose_video' in captured[0]
    assert 'instrução' in captured[0]
    assert requires_compression(total)


# Cenário: um histórico maior que a janela é resumido em lotes limitados
# Dado vinte pares de mensagens persistidos
# Quando a consolidação é solicitada para todas as respostas
# Então só o primeiro lote é enviado e as mensagens desse lote são as únicas removidas
def test_consolidate_limits_each_summary_batch_before_calling_summarizer():
    import asyncio
    import json
    from memory import consolidate, count_tokens

    rows = []
    for index in range(20):
        rows.append({'id': f'user-{index}', 'role': 'user', 'content': 'café ' * 1500})
        rows.append({'id': f'assistant-{index}', 'role': 'assistant', 'content': 'resposta útil ' * 400})

    class Transaction:
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): return False

    class Connection:
        def __init__(self):
            self.rows = rows.copy()
            self.facts = None

        async def fetch(self, _query, _conversation_id, response_offset):
            assistants = [index for index, row in enumerate(self.rows) if row['role'] == 'assistant']
            if response_offset >= len(assistants): return []
            return self.rows[:assistants[response_offset] + 1]

        async def fetchval(self, *_args): return self.facts

        async def execute(self, query, *_args):
            if query.startswith('INSERT INTO chat_memories'):
                self.facts = _args[1]
            elif query.startswith('DELETE FROM chat_messages'):
                deleted = set(_args[1])
                self.rows = [row for row in self.rows if row['id'] not in deleted]

        def transaction(self): return Transaction()

    connection = Connection()

    class Acquire:
        async def __aenter__(self): return connection
        async def __aexit__(self, *_args): return False

    class Pool:
        def acquire(self): return Acquire()

    captured = []

    async def summarize(previous, messages):
        payload = json.dumps({'previous': previous, 'messages': [{'role': row['role'], 'content': row['content']} for row in messages]}, ensure_ascii=False)
        captured.append((len(messages), count_tokens(payload)))
        return '{"facts":[{"topic":"resumo","text":"informações preservadas"}]}'

    assert asyncio.run(consolidate(Pool(), 'conversation', summarize, min_responses=20))
    assert len(captured) == 1
    assert captured[0][0] == 10
    assert captured[0][1] <= 40_000
    assert len(connection.rows) == 30


# Cenário: nenhuma mensagem é removida se nem o menor lote cabe no orçamento
# Dado uma interação cuja mensagem excede o orçamento seguro
# Quando o resumo é solicitado
# Então a chamada falha antes do sumarizador e preserva a interação
def test_consolidate_rejects_oversized_minimum_without_pruning(monkeypatch):
    import asyncio
    import memory

    rows = [
        {'id': 'user-1', 'role': 'user', 'content': 'conteúdo longo'},
        {'id': 'assistant-1', 'role': 'assistant', 'content': 'resposta'},
    ]

    class Transaction:
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): return False

    class Connection:
        def __init__(self): self.rows, self.facts = rows.copy(), None
        async def fetch(self, *_args): return self.rows.copy()
        async def fetchval(self, *_args): return self.facts
        async def execute(self, query, *args):
            if query.startswith('DELETE FROM chat_messages'):
                deleted = set(args[1])
                self.rows = [row for row in self.rows if row['id'] not in deleted]
            elif query.startswith('INSERT INTO chat_memories'):
                self.facts = args[1]
        def transaction(self): return Transaction()

    connection = Connection()

    class Acquire:
        async def __aenter__(self): return connection
        async def __aexit__(self, *_args): return False

    class Pool:
        def acquire(self): return Acquire()

    monkeypatch.setattr(memory, 'count_tokens', lambda _text: 40_000)
    summary_calls = 0

    async def summarize(_previous, _messages):
        nonlocal summary_calls
        summary_calls += 1
        return '{"facts":[{"topic":"resumo","text":"informações preservadas"}]}'

    try:
        asyncio.run(memory.consolidate(Pool(), 'conversation', summarize, min_responses=1))
    except memory.ContextBudgetExceeded:
        pass
    else:
        raise AssertionError('context budget must reject the summary before model use')
    assert summary_calls == 0
    assert connection.rows == rows


# Cenário: compactação de memórias divide fatos extensos em lotes seguros
# Dado uma memória maior que o orçamento de sumarização
# Quando as memórias do usuário são compactadas
# Então cada chamada ao modelo fica limitada e a memória é atualizada
def test_compress_memories_limits_each_summary_input():
    import asyncio
    import json
    from memory import compress_memories, count_tokens

    original = [{'topic': f'tópico {index}', 'text': 'detalhe útil ' * 100} for index in range(120)]

    class Transaction:
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): return False

    class Connection:
        def __init__(self): self.facts = json.dumps(original)
        async def fetch(self, *_args): return [{'conversation_id': 'conversation', 'facts': self.facts}]
        async def execute(self, _query, _conversation_id, facts): self.facts = facts
        def transaction(self): return Transaction()

    connection = Connection()

    class Acquire:
        async def __aenter__(self): return connection
        async def __aexit__(self, *_args): return False

    class Pool:
        def acquire(self): return Acquire()

    captured = []

    async def summarize(facts):
        captured.append(count_tokens(json.dumps(facts, ensure_ascii=False)))
        return '{"facts":[{"topic":"resumo","text":"fatos preservados"}]}'

    asyncio.run(compress_memories(Pool(), 'tenant', 'user', summarize))
    assert len(captured) > 1
    assert all(tokens + 4096 <= 40_000 for tokens in captured)
    assert len(json.loads(connection.facts)) < len(original)
