"""Contrato independente do gate chatbot; execute com Python sem dependências."""
from pathlib import Path
import importlib.util
import os
import socket
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import subprocess

ROOT = Path(__file__).resolve().parents[2]


class ChatbotCIContract(unittest.TestCase):
    def test_check_dedicado_executa_gate_real_e_publica_evidencias(self):
        path = ROOT / '.github/workflows/chatbot.yml'
        self.assertTrue(path.is_file(), 'Falta workflow/check dedicado chatbot')
        workflow = path.read_text()
        for required in ('chatbot:', "python-version: '3.12'", 'chatbot-gate.py',
                         'actions/upload-artifact@', 'if: always()', 'timeout-minutes:'):
            self.assertIn(required, workflow)
        self.assertNotIn('continue-on-error', workflow)
        self.assertIn('branches: [dev, main, hmg, feat/422-chatbot-ready]', workflow)

    def test_ci_instala_parsers_nativos_de_midia(self):
        workflow = (ROOT / '.github/workflows/chatbot.yml').read_text()
        self.assertIn('sudo apt-get update', workflow)
        self.assertIn('sudo apt-get install -y --no-install-recommends ffmpeg poppler-utils util-linux', workflow)

    def test_gate_habilita_bancos_reais_smoke_e_todos_e2es(self):
        path = ROOT / 'scripts/ci/chatbot-gate.py'
        self.assertTrue(path.is_file(), 'Falta gate executável local/CI')
        gate = path.read_text()
        for required in ('CHAT_TEST_DATABASE_URL', 'TEST_CHAT_DATABASE_URL',
                         'CHAT_MEDIA_TEST_DATABASE_URL', 'CHAT_PLAN_TEST_DATABASE_URL',
                         'CHAT_OUTCOME_TEST_DATABASE_URL', 'CHAT_TITLE_TEST_DATABASE_URL',
                         'CHAT_PLAN_TEST_REDIS_URL', 'TEST_CHAT_REDIS_URL',
                         '127.0.0.1', '_isolated', 'chat-real.spec.ts', 'chat*.spec.ts',
                         "'build'", "'openapi.json'", 'finally:', 'killpg',
                         'junit', 'assert_no_skips'):
            self.assertIn(required, gate)
        self.assertNotIn('/home/', gate)

    def test_ci_generico_nao_duplica_gate_chat(self):
        ci = (ROOT / '.github/workflows/ci.yml').read_text()
        for obsolete in ('Install chat dependencies', 'Run chat BDD', 'Run chat API',
                         'Run chat video', 'Run chat E2E', 'setup-python', 'Install Playwright'):
            self.assertNotIn(obsolete, ci)
        for owned in ('chat-*.test.ts', 'studio-video-*.test.ts',
                      'brand-whatsapp-migration.bdd.test.ts', 'openrouter-video-http.integration.test.ts'):
            self.assertIn(f"--exclude '**/{owned}'", ci)

    def test_playwright_portavel_sem_reuso_ou_trace_perdido(self):
        config = (ROOT / 'apps/web/playwright.chat-mock.config.ts').read_text()
        self.assertNotIn('/home/', config)
        for required in ('CHAT_E2E_WEB_URL', 'CHAT_E2E_OUTPUT_DIR', 'CHAT_E2E_EXTERNAL_SERVER',
                         'retain-on-failure', 'reuseExistingServer: false'):
            self.assertIn(required, config)
    def test_gate_recusa_skips_e_relatorio_vazio_e_aceita_execucao_real(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as directory:
            with patch.dict(os.environ, {'CHATBOT_ARTIFACT_DIR': directory,
                                        'DATABASE_URL': 'postgresql://sentinel.invalid/production',
                                        'OPENROUTER_API_KEY': 'must-not-leak',
                                        'R2_SECRET_ACCESS_KEY': 'must-not-leak'}):
                spec = importlib.util.spec_from_file_location('chatbot_gate', ROOT / 'scripts/ci/chatbot-gate.py')
                assert spec is not None and spec.loader is not None
                module = importlib.util.module_from_spec(spec)
                with patch.object(sys, 'dont_write_bytecode', True):
                    spec.loader.exec_module(module)
            self.assertNotIn('DATABASE_URL', module.ENV)
            self.assertEqual(module.ENV['OPENROUTER_API_KEY'], '')
            self.assertNotIn('R2_SECRET_ACCESS_KEY', module.ENV)
            report = Path(directory) / 'report.xml'
            for body in ('<testsuites/>', '<testsuite><testcase><skipped/></testcase></testsuite>'):
                report.write_text(body)
                with self.assertRaises(RuntimeError):
                    module.assert_no_skips(report)
            report.write_text('<testsuite><testcase name="real"/></testsuite>')
            module.assert_no_skips(report)


class ContainerOwnershipSafety(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR'))
        self.addCleanup(self.directory.cleanup)
        with patch.dict(os.environ, {'CHATBOT_ARTIFACT_DIR': self.directory.name}):
            spec = importlib.util.spec_from_file_location('gate_safety', ROOT / 'scripts/ci/chatbot-gate.py')
            assert spec is not None and spec.loader is not None
            self.gate = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.gate)
        self.docker = self.enterContext(patch.object(self.gate, 'docker'))
        # Pure tests: subprocess entrypoints cannot launch any real command.
        self.commands = self.enterContext(patch.object(self.gate.subprocess, 'run'))
        self.enterContext(patch.object(self.gate.subprocess, 'Popen', side_effect=AssertionError('real process forbidden')))

    def test_failed_start_keeps_confirmed_container_id_owned(self):
        failure = subprocess.CalledProcessError(1, ['docker', 'start'])
        self.docker.side_effect = ['a' * 64, failure]
        with self.assertRaises(subprocess.CalledProcessError) as raised:
            self.gate.provision('redis:7', 'disposable', 6379)
        self.assertIs(raised.exception, failure)
        self.assertEqual(self.gate.OWNED, ['a' * 64])
        self.assertEqual(self.docker.call_args_list[0].args[0], 'create')
        self.assertEqual(self.docker.call_args_list[1].args, ('start', 'a' * 64))

    def run_main(self, operation):
        self.enterContext(patch.object(self.gate.sys, 'version_info', (3, 12)))
        self.enterContext(patch.object(self.gate.sys, 'argv', ['gate', '--phase', 'image']))
        self.enterContext(patch.object(self.gate, 'run'))
        self.enterContext(patch.object(self.gate, 'image_smoke', side_effect=operation))
        self.gate.main()

    def test_teardown_continues_after_resource_failure_and_preserves_primary_error(self):
        primary = RuntimeError('phase failed')
        self.gate.OWNED[:] = ['a' * 64, 'b' * 64]
        self.gate.ENV['CHATBOT_SMOKE_IMAGE'] = 'chatbot-ci:owned'
        process = Mock()
        process.poll.return_value = None
        process.pid = 12345
        self.gate.PROCESSES.append(process)
        kill = self.enterContext(patch.object(self.gate.os, 'killpg', side_effect=OSError('process cleanup failed')))
        self.commands.side_effect = OSError('log collection failed')

        image_ids = iter(('image-id', ''))

        def docker(*args):
            if args == ('rm', '-f', 'b' * 64):
                raise RuntimeError('first removal failed')
            if args == ('image', 'ls', '-q', 'chatbot-ci:owned'):
                return next(image_ids)
            return ''
        self.docker.side_effect = docker
        with self.assertRaises(RuntimeError) as raised:
            self.run_main(primary)
        self.assertIs(raised.exception, primary)
        kill.assert_called_once()
        for container_id in ('a' * 64, 'b' * 64):
            self.docker.assert_any_call('rm', '-f', container_id)
            self.docker.assert_any_call('ps', '-aq', '--no-trunc', '--filter', f'id={container_id}')
        self.docker.assert_any_call('image', 'rm', '-f', 'chatbot-ci:owned')
        self.assertFalse((self.gate.ART / 'success.json').exists())

    def test_cleanup_failure_without_primary_error_fails_gate(self):
        self.gate.OWNED.append('a' * 64)
        self.commands.return_value.returncode = 0
        self.docker.return_value = 'a' * 64  # removal did not actually remove it
        with self.assertRaisesRegex(RuntimeError, 'cleanup'):
            self.run_main(None)
        self.assertFalse((self.gate.ART / 'success.json').exists())

    def test_failed_start_is_removed_by_main_using_id_not_name(self):
        container_id = 'a' * 64
        primary = subprocess.CalledProcessError(1, ['docker', 'start'])
        def docker(*args):
            if args[0] == 'create':
                return container_id
            if args[0] == 'start':
                raise primary
            return ''
        self.docker.side_effect = docker
        self.commands.return_value.returncode = 0
        with self.assertRaises(subprocess.CalledProcessError) as raised:
            self.run_main(lambda: self.gate.provision('redis:7', 'disposable', 6379))
        self.assertIs(raised.exception, primary)
        self.docker.assert_any_call('rm', '-f', container_id)
        self.docker.assert_any_call('ps', '-aq', '--no-trunc', '--filter', f'id={container_id}')

    def test_name_collision_never_claims_or_deletes_foreign_container(self):
        self.docker.side_effect = subprocess.CalledProcessError(1, ['docker', 'create'])
        with self.assertRaises(subprocess.CalledProcessError):
            self.gate.provision('redis:7', 'foreign', 6379)
        self.assertEqual(self.gate.OWNED, [])
        self.assertEqual(self.docker.call_count, 1)
        self.assertEqual(self.docker.call_args.args[0], 'create')

    # Funcionalidade: o gate deve rejeitar listeners que não pertencem ao E2E.
    # Cenário: uma porta loopback já está ocupada.
    # Dado que outro processo está escutando nessa porta
    # Quando o gate verifica a disponibilidade
    # Então a execução falha antes de se conectar a esse serviço.
    def test_gate_refuses_a_loopback_port_already_in_use(self):
        guard = getattr(self.gate, 'assert_ports_available', None)
        if not callable(guard):
            self.fail('The gate must preflight E2E listener ports')
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            port = listener.getsockname()[1]
            with self.assertRaises(RuntimeError) as raised:
                guard((port,))
            self.assertIn(f':{port} is already in use', str(raised.exception))

    # Funcionalidade: iniciar o E2E real somente com as portas próprias livres.
    # Cenário: alguma porta fixa do E2E está indisponível.
    # Dado que o gate inicia a fase mock
    # Quando chega à fase real e o preflight recusa as portas
    # Então nenhum servidor E2E é iniciado.
    def test_real_e2e_preflights_api_web_and_chat_ports_before_start(self):
        guard = getattr(self.gate, 'assert_ports_available', None)
        if not callable(guard):
            self.fail('The gate must preflight E2E listener ports')
        with patch.object(self.gate, 'run') as run, \
             patch.object(self.gate, 'assert_no_skips'), \
             patch.object(self.gate, 'start') as start, \
             patch.object(self.gate, 'assert_ports_available', side_effect=RuntimeError('port already in use')) as preflight:
            with self.assertRaisesRegex(RuntimeError, 'port already in use'):
                self.gate.e2e_tests()
        self.assertEqual(run.call_count, 1)
        preflight.assert_called_once_with((3199, 5199, 8199))
        start.assert_not_called()


if __name__ == '__main__':
    unittest.main()
