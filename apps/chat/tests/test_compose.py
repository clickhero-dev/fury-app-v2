"""
Funcionalidade: executar o chat em container isolado
Cenário: habilitar o serviço de chat no ambiente local
Dado o banco e a API do Ady disponíveis no ambiente de desenvolvimento
Quando o perfil de chat é configurado
Então o serviço alcança o banco e a API e só é exposto no loopback
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest


def test_imagem_inclui_modulos_de_anexos():
    # Dado COPY explícito, quando empacota, então repository/leitor existem no container.
    dockerfile = (Path(__file__).resolve().parents[1] / 'Dockerfile').read_text()
    assert 'attachment_repository.py' in dockerfile
    assert 'attachment_context.py' in dockerfile


def test_imagem_inclui_modulos_de_confirmacao_e_disponibilidade():
    # Cenário: dado COPY explícito, quando empacota, então importa os novos módulos.
    dockerfile = (Path(__file__).resolve().parents[1] / 'Dockerfile').read_text()
    for module in ('action_outcomes.py', 'approval_repository.py', 'video_availability.py'):
        assert module in dockerfile


def test_imagem_inclui_modulos_de_titulos():
    dockerfile = (Path(__file__).resolve().parents[1] / 'Dockerfile').read_text()
    assert 'conversation_repository.py' in dockerfile
    assert 'conversation_titles.py' in dockerfile


def test_configuracao_do_container_inclui_chaves_dos_tres_provedores():
    compose = (Path(__file__).resolve().parents[3] / 'infra/docker-compose.yml').read_text()
    for key in ('OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'):
        assert f'{key}: ${{{key}:-}}' in compose
    requirements = (Path(__file__).resolve().parents[1] / 'requirements.txt').read_text()
    assert any(line.startswith('anthropic') for line in requirements.splitlines())


def test_compose_repassa_origins_do_websocket():
    compose = (Path(__file__).resolve().parents[1] / '../../infra/docker-compose.yml').resolve().read_text()
    assert 'CHAT_WS_ALLOWED_ORIGINS: ${CHAT_WS_ALLOWED_ORIGINS:-}' in compose


@pytest.mark.skipif(shutil.which('docker') is None, reason='Docker indisponível')
def test_perfil_chat_tem_rede_e_configuracao_local():
    root = Path(__file__).resolve().parents[3]
    result = subprocess.run(
        ['docker', 'compose', '-f', str(root / 'infra/docker-compose.yml'), '--profile', 'chat', 'config', '--format', 'json'],
        capture_output=True, text=True, check=True,
        env={**os.environ, 'ADY_API_URL': 'http://host.docker.internal:3000',
             'OPENAI_API_KEY': 'synthetic-openai',
             'ANTHROPIC_API_KEY': 'synthetic-anthropic',
             'OPENROUTER_API_KEY': 'synthetic-openrouter'},
    )
    service = json.loads(result.stdout)['services']['chat']
    assert service['environment']['DATABASE_URL'].startswith('postgresql://')
    assert service['environment']['ADY_API_URL'] == 'http://host.docker.internal:3000'
    assert service['environment']['OPENAI_API_KEY'] == 'synthetic-openai'
    assert service['environment']['ANTHROPIC_API_KEY'] == 'synthetic-anthropic'
    assert service['environment']['OPENROUTER_API_KEY'] == 'synthetic-openrouter'
    assert service['ports'][0]['host_ip'] == '127.0.0.1'
    assert 'postgres' in service['depends_on']
