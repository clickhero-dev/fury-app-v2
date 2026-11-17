"""Smoke portátil da imagem REAL: python apps/chat/tests/smoke_image.py IMAGE.

Não injeta env do host, não usa volumes nem rede externa. Exercita o CMD real,
importa app dentro da imagem e consulta OpenAPI pelo loopback do container.
Remove e verifica a remoção somente do container exclusivo desta execução.
"""
import json
import subprocess
import sys
import uuid


PROBE = r'''
import json
import os
import time
import urllib.request

assert not any(os.environ.get(key) for key in (
    'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL', 'ADY_API_URL',
    'CHAT_DELEGATION_SECRET',
)), 'Smoke deve executar sem credenciais ou serviços externos'
from app import app
assert app is not None
for attempt in range(60):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8000/openapi.json', timeout=2) as response:
            assert response.status == 200
            schema = json.load(response)
        assert schema['openapi'].startswith('3.')
        assert '/conversations' in schema['paths']
        assert 'get' in schema['paths']['/conversations']
        print(json.dumps({'import': 'app:app OK', 'http_status': 200,
                          'openapi': schema['openapi'], 'paths': len(schema['paths'])}))
        break
    except (OSError, TimeoutError):
        if attempt == 59:
            raise
        time.sleep(0.5)
'''


def smoke_image(image):
    name = f'fury-chat-packaging-smoke-{uuid.uuid4().hex}'
    container_id = None
    try:
        container_id = subprocess.check_output([
            'docker', 'run', '--detach', '--name', name, '--network', 'none',
            '--env', 'PYTHON_DOTENV_DISABLED=1', image,
        ], text=True).strip()
        details = json.loads(subprocess.check_output(['docker', 'inspect', name], text=True))[0]
        assert details['HostConfig']['NetworkMode'] == 'none'
        assert not details['Mounts']
        print(json.dumps({'container': name, 'id': container_id, 'image': details['Image']}), flush=True)
        subprocess.run(['docker', 'exec', name, 'python', '-c', PROBE], check=True, timeout=90)
    finally:
        if container_id:
            subprocess.run(['docker', 'logs', name], check=False)
        # docker run can create the container before reporting a startup failure.
        existing = subprocess.run(['docker', 'container', 'inspect', name], capture_output=True)
        if existing.returncode == 0:
            subprocess.run(['docker', 'rm', '--force', name], check=True)
        remaining = subprocess.check_output([
            'docker', 'ps', '--all', '--quiet', '--filter', f'name=^/{name}$',
        ], text=True).strip()
        assert not remaining, f'Container smoke não removido: {name}'
        print(f'cleanup verified: {name} absent', flush=True)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Uso: python apps/chat/tests/smoke_image.py IMAGE')
    smoke_image(sys.argv[1])
