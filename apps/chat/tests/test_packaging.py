"""Regressão do fechamento dos imports locais no pacote Docker.

Funcionalidade: iniciar o serviço empacotado sem dependências externas
Cenário: disponibilizar todos os módulos locais importados pelo serviço
Dado o entrypoint app.py e seus imports locais transitivos
Quando a imagem é montada com COPY explícito
Então nenhum módulo necessário fica fora do pacote
"""
import ast
import shlex
from pathlib import Path


CHAT_ROOT = Path(__file__).resolve().parents[1]


def test_imagem_inclui_fechamento_dos_imports_locais():
    copied = set()
    for line in (CHAT_ROOT / 'Dockerfile').read_text().splitlines():
        parts = shlex.split(line)
        if parts and parts[0].upper() == 'COPY':
            for source in parts[1:-1]:
                copied.update(path.name for path in CHAT_ROOT.glob(source) if path.is_file())

    pending = ['app']
    visited = set()
    missing = set()
    while pending:
        module = pending.pop()
        if module in visited:
            continue
        visited.add(module)
        source = CHAT_ROOT / f'{module}.py'
        if source.name not in copied:
            missing.add(source.name)
        for node in ast.walk(ast.parse(source.read_text())):
            imports = (
                [alias.name for alias in node.names] if isinstance(node, ast.Import)
                else [node.module] if isinstance(node, ast.ImportFrom) and node.module
                else []
            )
            for name in imports:
                local = name.split('.')[0]
                if (CHAT_ROOT / f'{local}.py').is_file():
                    pending.append(local)

    assert not missing, f'Módulos locais importados ausentes do COPY Docker: {sorted(missing)}'
