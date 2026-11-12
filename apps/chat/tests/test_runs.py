"""Funcionalidade: cercar gravações de execução expirada
Cenário: worker perdeu o lease
Dado uma execução interrompida
Quando tenta registrar proposta
Então gravação é recusada
"""
import asyncio
import pytest
from runs import FencedDB, RunExpired

def test_expired_run_rejects_proposal():
    async def run():
        class Transaction:
            async def __aenter__(self): return self
            async def __aexit__(self,*args): return False
        class Connection:
            def transaction(self): return Transaction()
            async def fetchval(self,*args): return None
            async def fetchrow(self,*args): raise AssertionError('não deve gravar')
        class Acquire:
            async def __aenter__(self): return Connection()
            async def __aexit__(self,*args): return False
        class Pool:
            def acquire(self): return Acquire()
        with pytest.raises(RunExpired):
            await FencedDB(Pool(),'run','lease').fetchrow('INSERT INTO chat_approvals ...')
    asyncio.run(run())

# Cenário: worker antigo não conclui resposta após perder lease
# Dado uma execução expirada
# Quando tenta salvar resposta
# Então nenhuma mensagem é gravada

def test_expired_run_cannot_complete():
    async def run():
        class Transaction:
            async def __aenter__(self): return self
            async def __aexit__(self,*args): return False
        class Connection:
            def transaction(self): return Transaction()
            async def fetchval(self,*args): return None
            async def fetchrow(self,*args): raise AssertionError('não deve gravar')
        class Acquire:
            async def __aenter__(self): return Connection()
            async def __aexit__(self,*args): return False
        class Pool:
            def acquire(self): return Acquire()
        with pytest.raises(RunExpired): await FencedDB(Pool(),'run','lease').complete('conversation','resposta')
    asyncio.run(run())
