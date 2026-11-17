"""Provider-free chatbot gate. Requires installed workspace/web + Python 3.12 deps.

Run: python scripts/ci/chatbot-gate.py [--phase all|image|python|api|e2e]
Owns disposable Docker services; never uses caller DATABASE_URL or credentials.
CHATBOT_ARTIFACT_DIR controls evidence output; no existing service is modified.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
ART = Path(os.environ.get('CHATBOT_ARTIFACT_DIR', ROOT / '.chatbot-ci')).resolve()
ART.mkdir(parents=True, exist_ok=True)
# Allow runtime plumbing only, not caller application/provider credentials.
ENV = {k: v for k, v in os.environ.items() if k in (
    'PATH', 'HOME', 'USER', 'LANG', 'CI', 'VIRTUAL_ENV', 'PNPM_HOME',
    'DOCKER_HOST', 'DOCKER_CONTEXT', 'XDG_RUNTIME_DIR', 'PLAYWRIGHT_BROWSERS_PATH',
    'TMPDIR', 'LD_LIBRARY_PATH')}
ENV.update({
    'NODE_ENV': 'test', 'PYTHON_DOTENV_DISABLED': '1', 'PYTHONDONTWRITEBYTECODE': '1',
    'DOTENV_CONFIG_PATH': '/dev/null', 'SUPERADMIN_EMAIL': '', 'SUPERADMIN_PASSWORD': '',
    'OPENROUTER_API_KEY': '', 'POSTHOG_API_KEY': '', 'POSTHOG_KEY': '',
    'VITE_POSTHOG_KEY': '', 'MODEL_CHATBOT': 'deepseek/deepseek-v4-pro-0813',
    'CHAT_DELEGATION_SECRET': 'ci-only-chat-delegation-secret-32-characters',
    'JWT_SECRET': 'ci-only-jwt-secret-with-32-characters-minimum',
    'JWT_REFRESH_SECRET': 'ci-only-refresh-secret-32-characters-minimum',
    'TOKEN_ENCRYPTION_KEY': '0123456789abcdef' * 4,
})
OWNED = []
PROCESSES = []


def run(args, name, cwd=ROOT):
    print(f'[{name}] {args}', flush=True)
    with (ART / f'{name}.log').open('w') as log:
        process = subprocess.Popen([str(x) for x in args], cwd=cwd, env=ENV,
                                   stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = process.wait()
            if code:
                raise subprocess.CalledProcessError(code, args)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=5)


def docker(*args):
    return subprocess.check_output(['docker', *args], env=ENV, text=True).strip()


def provision(image, name, port, extra=()):
    # A failed start may leave a created container. Claim its ID before starting;
    # a failed create (including name collisions) never grants ownership.
    container_id = docker('create', '--name', name, '-p', f'127.0.0.1::{port}', *extra, image)
    OWNED.append(container_id)
    docker('start', container_id)
    mapping = json.loads(docker('inspect', container_id))[0]['NetworkSettings']['Ports'][f'{port}/tcp'][0]
    return mapping['HostPort']


def assert_no_skips(report):
    tree = ET.parse(report)
    cases = list(tree.iter('testcase'))
    if not cases or any(case.find('skipped') is not None for case in cases):
        raise RuntimeError(f'Gate must execute tests without silent skips: {report}')


def wait_http(url):
    for _ in range(90):
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        if any(p.poll() is not None for p in PROCESSES):
            raise RuntimeError('E2E service exited; inspect artifacts')
        time.sleep(1)
    raise RuntimeError(f'Healthcheck timed out: {url}')


def assert_ports_available(ports):
    for port in ports:
        try:
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', port))
        except OSError as error:
            raise RuntimeError(f'E2E port 127.0.0.1:{port} is already in use') from error


def start(args, name, cwd):
    log = (ART / f'{name}.log').open('w')
    try:
        process = subprocess.Popen(args, cwd=cwd, env=ENV, stdout=log,
                                   stderr=subprocess.STDOUT, start_new_session=True)
    finally:
        log.close()
    PROCESSES.append(process)


def image_smoke():
    tag = f'chatbot-ci:{uuid.uuid4().hex[:12]}'
    try:
        run(['docker', 'build', '-t', tag, 'apps/chat'], 'image-build')
        # Runs the built production entrypoint, not source mounted from checkout.
        name = f'chatbot-ci-smoke-{uuid.uuid4().hex[:12]}'
        port = provision(tag, name, 8000, ('-e', 'PYTHON_DOTENV_DISABLED=1'))
        wait_http(f'http://127.0.0.1:{port}/openapi.json')
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/openapi.json') as response:
            schema = json.load(response)
        assert '/conversations' in schema['paths'], schema['paths'].keys()
        (ART / 'openapi.json').write_text(json.dumps(schema, indent=2))
    finally:
        # Container cleanup happens before image removal in main().
        ENV['CHATBOT_SMOKE_IMAGE'] = tag


def databases():
    token = uuid.uuid4().hex[:12]
    pg = f'chatbot-ci-pg-{token}'
    pgport = provision('postgres:16', pg, 5432, (
        '-e', 'POSTGRES_DB=chatbot_ci_isolated', '-e', 'POSTGRES_USER=chatbot',
        '-e', 'POSTGRES_PASSWORD=chatbot_ci_only'))
    # Legacy outage regression asserts this exact disposable name and port.
    redis = 'fury-chat-recovery-outage-test'
    redisport = provision('redis:7', redis, 6379)
    for _ in range(60):
        if subprocess.run(['docker', 'exec', pg, 'pg_isready', '-U', 'chatbot'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Postgres did not become ready')
    for _ in range(60):
        if docker('exec', redis, 'redis-cli', 'ping') == 'PONG':
            break
        time.sleep(1)
    else:
        raise RuntimeError('Redis did not become ready')
    url = f'postgresql://chatbot:chatbot_ci_only@127.0.0.1:{pgport}/chatbot_ci_isolated'
    for key in ('DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_CHAT_DATABASE_URL',
                'CHAT_TEST_DATABASE_URL', 'CHAT_MEDIA_TEST_DATABASE_URL',
                'CHAT_PLAN_TEST_DATABASE_URL', 'CHAT_OUTCOME_TEST_DATABASE_URL',
                'CHAT_TITLE_TEST_DATABASE_URL', 'CHAT_E2E_DATABASE_URL'):
        ENV[key] = url
    for key in ('REDIS_URL', 'TEST_CHAT_REDIS_URL', 'CHAT_PLAN_TEST_REDIS_URL'):
        ENV[key] = f'redis://127.0.0.1:{redisport}/15'
    ENV['TEST_CHAT_REDIS_CONTAINER'] = redis
    run(['pnpm', '--filter', '@fury/shared', 'build'], 'build-shared')
    run(['pnpm', '--filter', '@fury/db', 'build'], 'build-db')
    run(['npm', 'run', 'db:migrate'], 'migrate')


def python_tests():
    ENV['PYTHONPATH'] = str(ROOT / 'apps/chat')
    report = ART / 'python-junit.xml'
    run([sys.executable, '-m', 'pytest', 'apps/chat/tests', '-q',
         f'--junitxml={report}'], 'python')
    assert_no_skips(report)


def api_tests():
    directory = ROOT / 'apps/api/src/__tests__'
    files = set(directory.glob('chat-*.test.ts'))
    for pattern in ('brand-whatsapp-migration.bdd.test.ts', 'openrouter-video-http.integration.test.ts',
                    'studio-video-*.test.ts'):
        files.update(directory.glob(pattern))
    if not files:
        raise RuntimeError('No chatbot API tests discovered')
    (ART / 'api-inventory.json').write_text(json.dumps([str(p.relative_to(ROOT)) for p in sorted(files)], indent=2))
    # Sequential files avoid shared DB/Redis cleanup races; each gets evidence.
    for path in sorted(files):
        report = ART / f'{path.stem}-junit.xml'
        run([ROOT / 'node_modules/.bin/vitest', 'run', str(path.relative_to(ROOT)),
             '--reporter=default', '--reporter=junit', f'--outputFile={report}'], path.stem)
        assert_no_skips(report)


def e2e_tests():
    web = ROOT / 'apps/web'
    playwright = web / 'node_modules/.bin/playwright'
    config = 'playwright.chat-mock.config.ts'
    for phase in ('mock', 'real'):
        ENV['CHAT_E2E_OUTPUT_DIR'] = str(ART / f'e2e-{phase}')
        ENV['PLAYWRIGHT_JUNIT_OUTPUT_FILE'] = str(ART / f'e2e-{phase}-junit.xml')
        if phase == 'real':
            # Reject foreign listeners before any harness/API server can start.
            assert_ports_available((3199, 5199, 8199))
            ENV.update({'PORT': '3199', 'ADY_API_URL': 'http://127.0.0.1:3199',
                        'CHAT_SERVICE_URL': 'http://127.0.0.1:8199',
                        'CHAT_E2E_WEB_URL': 'http://127.0.0.1:5199',
                        'CHAT_E2E_JWT_SECRET': ENV['JWT_SECRET'],
                        'CHAT_E2E_EXTERNAL_SERVER': '1',
                        'VITE_API_URL': 'http://127.0.0.1:3199/api'})
            start([sys.executable, 'tests/e2e_server.py'], 'e2e-chat', ROOT / 'apps/chat')
            start([str(ROOT / 'node_modules/.bin/tsx'), 'src/chat-e2e-server.ts'], 'e2e-api', ROOT / 'apps/api')
            # Reuse the portable config's Vite env isolation, but let Playwright own Vite.
            ENV.pop('CHAT_E2E_EXTERNAL_SERVER')
            for url in ('http://127.0.0.1:8199/openapi.json', 'http://127.0.0.1:3199/api/health'):
                wait_http(url)
        args = [playwright, 'test', '-c', config, '--workers=1', '--reporter=list,junit']
        args += ['chat-real.spec.ts'] if phase == 'real' else []
        # Select every chat*.spec.ts, not the unrelated tickets suite.
        if phase == 'mock':
            args += [p.name for p in sorted((web / 'e2e-mock').glob('chat*.spec.ts')) if p.name != 'chat-real.spec.ts']
        run(args, f'e2e-{phase}', web)
        assert_no_skips(ART / f'e2e-{phase}-junit.xml')


def cleanup():
    """Attempt every owned resource; callers preserve any primary gate failure."""
    errors = []

    def attempt(action, *args):
        try:
            action(*args)
        except Exception as error:
            errors.append(error)
            print(f'[cleanup] {error}', file=sys.stderr)

    def stop_process(process):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)

    def collect_logs(container_id):
        with (ART / f'{container_id}.log').open('w') as log:
            subprocess.run(['docker', 'logs', container_id], env=ENV,
                           stdout=log, stderr=subprocess.STDOUT, check=True)

    def verify_removed(container_id):
        # Unlike a failed inspect, a successful empty listing proves absence.
        if docker('ps', '-aq', '--no-trunc', '--filter', f'id={container_id}'):
            raise RuntimeError(f'cleanup left container {container_id}')

    def remove_image(tag):
        if docker('image', 'ls', '-q', tag):
            docker('image', 'rm', '-f', tag)
            if docker('image', 'ls', '-q', tag):
                raise RuntimeError(f'cleanup left image {tag}')

    for process in reversed(PROCESSES):
        attempt(stop_process, process)
    for container_id in reversed(OWNED):
        attempt(collect_logs, container_id)
        attempt(docker, 'rm', '-f', container_id)
        attempt(verify_removed, container_id)
    if ENV.get('CHATBOT_SMOKE_IMAGE'):
        attempt(remove_image, ENV['CHATBOT_SMOKE_IMAGE'])
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=['all', 'image', 'python', 'api', 'e2e'], default='all')
    phase = parser.parse_args().phase
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError('Chatbot CI requires Python 3.12')
    (ART / 'success.json').unlink(missing_ok=True)
    try:
        run([sys.executable, 'scripts/ci/chatbot-contract.test.py'], 'contract')
        if phase in ('all', 'image'):
            image_smoke()
        if phase != 'image':
            databases()
            if phase in ('all', 'python'):
                python_tests()
            if phase in ('all', 'api'):
                api_tests()
            if phase in ('all', 'e2e'):
                e2e_tests()
    finally:
        primary_error = sys.exc_info()[0] is not None
        errors = cleanup()
        if errors and not primary_error:
            raise RuntimeError(f'Gate cleanup failed for {len(errors)} operation(s)') from errors[0]
    (ART / 'success.json').write_text(json.dumps({'phase': phase, 'python': sys.version}))


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    main()
