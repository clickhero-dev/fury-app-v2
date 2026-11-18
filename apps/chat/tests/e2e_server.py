"""Servidor de teste E2E: substitui apenas o provedor de modelo, nunca usado em produção."""
from pathlib import Path
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agno.agent

class FakeAgent:
    def __init__(self, **kwargs):
        pass

    def arun(self, *args, **kwargs):
        async def stream():
            yield SimpleNamespace(content='Resposta ')
            yield SimpleNamespace(content='retomada com sucesso.')
        return stream()

agno.agent.Agent = FakeAgent
os.environ['OPENAI_API_KEY'] = 'synthetic-e2e-only'
os.environ['ANTHROPIC_API_KEY'] = ''
os.environ['OPENROUTER_API_KEY'] = ''

import uvicorn
from app import app

if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=8199)
