"""The standalone E2E process must select its fake model without real secrets."""
import os
from pathlib import Path
import subprocess
import sys


def test_e2e_server_uses_only_synthetic_provider_credentials():
    server = Path(__file__).with_name('e2e_server.py')
    code = (
        "import os,runpy; "
        f"runpy.run_path({str(server)!r},run_name='fixture'); "
        "assert os.environ['OPENAI_API_KEY']=='synthetic-e2e-only'; "
        "assert not os.environ['ANTHROPIC_API_KEY']; "
        "assert not os.environ['OPENROUTER_API_KEY']; "
        "import asyncio; from multi_provider_core import collect_text; "
        "assert asyncio.run(collect_text('test',instructions=[]))=='Resposta retomada com sucesso.'"
    )
    subprocess.run([sys.executable, '-c', code], check=True, capture_output=True,
                   env={**os.environ, 'OPENAI_API_KEY':'private-test',
                        'ANTHROPIC_API_KEY':'private-test', 'OPENROUTER_API_KEY':'private-test'})
