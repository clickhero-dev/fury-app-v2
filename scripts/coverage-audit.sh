#!/usr/bin/env bash
# FURY Coverage Audit — fornece dados para o agente @qa
# Roda vitest com coverage, gera relatório de gaps
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== FURY Coverage Audit ==="

# 1. Garante que env vars de teste existem (testes que não precisam de DB)
export JWT_SECRET="${JWT_SECRET:-test-jwt-secret-min-32-characters-long-aaaa}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-test-jwt-refresh-secret-min-32-chars-aaaa}"
export TOKEN_ENCRYPTION_KEY="${TOKEN_ENCRYPTION_KEY:-test-token-encryption-key-32-chars!!}"
export NODE_ENV="${NODE_ENV:-test}"

# 2. Roda vitest com coverage
# ponytail: exclui testes de integração que precisam de PostgreSQL local.
# Coverage ainda coleta dados de todos os source files — só não roda esses testes.
echo "Running vitest with coverage (excluding DB integration tests)..."
npx vitest run --coverage --reporter=json --outputFile=/tmp/vitest-results.json \
  --exclude "**/auth.test.ts" \
  --exclude "**/automation.test.ts" \
  --exclude "**/campaigns.test.ts" \
  --exclude "**/metrics.test.ts" \
  --exclude "**/multitenancy.test.ts" \
  --exclude "**/request-logger.test.ts" \
  --exclude "**/seed-login.test.ts" \
  --exclude "**/studio-assets.test.ts" \
  --exclude "**/studio.test.ts" \
  --exclude "**/studio-copy.test.ts" \
  --testTimeout=10000 \
  2>/tmp/vitest-stderr.txt || true

# 3. Conta arquivos de origem vs arquivos de teste
API_SRC=$(find apps/api/src -name "*.ts" ! -name "*.test.*" ! -name "*.spec.*" ! -path "*/__tests__/*" | wc -l)
API_TESTS=$(find apps/api/src -name "*.test.*" -o -name "*.spec.*" | wc -l)
WEB_SRC=$(find apps/web/src -name "*.ts" -o -name "*.tsx" ! -name "*.test.*" ! -name "*.spec.*" | wc -l)
WEB_TESTS=$(find apps/web/src -name "*.test.*" -o -name "*.spec.*" 2>/dev/null | wc -l)

# 4. Extrai resultados do JSON (vitest 4.x mistura texto+JSON no outputFile)
PASS=$(python3 << 'PYEOF'
import json
with open('/tmp/vitest-results.json') as f:
    raw = f.read()
try:
    print(json.loads(raw).get('numPassedTests', 0))
except:
    for line in raw.strip().split('\n'):
        line = line.strip()
        if line.startswith('{'):
            try:
                print(json.loads(line).get('numPassedTests', 0)); break
            except: continue
PYEOF
)
FAIL=$(python3 << 'PYEOF'
import json
with open('/tmp/vitest-results.json') as f:
    raw = f.read()
try:
    print(json.loads(raw).get('numFailedTests', 0))
except:
    for line in raw.strip().split('\n'):
        line = line.strip()
        if line.startswith('{'):
            try:
                print(json.loads(line).get('numFailedTests', 0)); break
            except: continue
PYEOF
)
TOTAL=$(python3 << 'PYEOF'
import json
with open('/tmp/vitest-results.json') as f:
    raw = f.read()
try:
    print(json.loads(raw).get('numTotalTests', 0))
except:
    for line in raw.strip().split('\n'):
        line = line.strip()
        if line.startswith('{'):
            try:
                print(json.loads(line).get('numTotalTests', 0)); break
            except: continue
PYEOF
)

# 5. Coleta dados do coverage-final.json (v8 provider format)
COV_FILE="coverage/coverage-final.json"
if [ -f "$COV_FILE" ]; then
  python3 << 'PYEOF'
import json, os

with open('coverage/coverage-final.json') as f:
    data = json.load(f)

total_stmts = total_branches = total_funcs = total_lines = 0
count = 0
zero_files = []

for path, info in data.items():
    s = info.get('s', {})
    b = info.get('b', {})
    fns = info.get('f', {})

    stmt_count = len(s)
    stmt_hit = sum(1 for v in s.values() if v > 0)
    branch_count = sum(len(v) for v in b.values())
    branch_hit = sum(sum(1 for x in v if x > 0) for v in b.values())
    func_count = len(fns)
    func_hit = sum(1 for v in fns.values() if v > 0)

    if stmt_count > 0:
        total_stmts += stmt_hit / stmt_count * 100
    if branch_count > 0:
        total_branches += branch_hit / branch_count * 100
    if func_count > 0:
        total_funcs += func_hit / func_count * 100
    total_lines += stmt_hit / max(stmt_count, 1) * 100
    count += 1

    if stmt_hit == 0:
        short = path.replace(os.getcwd() + '/', '')
        zero_files.append(short)

if count > 0:
    print(f'Lines: {total_lines/count:.1f}% | Functions: {total_funcs/count:.1f}% | Branches: {total_branches/count:.1f}% | Statements: {total_stmts/count:.1f}%')
    print(f'Files analyzed: {count}')
else:
    print('No coverage data found')

print()
print('=== Files with 0% coverage ===')
zero_files.sort()
for f in zero_files:
    print(f'  {f}')
print(f'Total: {len(zero_files)} files with 0% coverage')
PYEOF
else
  echo "Coverage report not generated (tests may have failed before coverage could be collected)"
fi

# 6. Lista testes falhando
echo ""
echo "=== Failing tests ==="
python3 << 'PYEOF'
import json, os

with open('/tmp/vitest-results.json') as f:
    raw = f.read()

data = None
try:
    data = json.loads(raw)
except:
    for line in raw.strip().split('\n'):
        line = line.strip()
        if line.startswith('{'):
            try:
                data = json.loads(line); break
            except: continue

if not data:
    print('Could not parse test results')
    exit(0)

for suite in data.get('testResults', []):
    if suite.get('status') == 'failed':
        name = suite.get('name', '').replace(os.getcwd() + '/', '')
        msg = (suite.get('message', '') or '')[:150]
        print(f'  FAIL: {name}')
        if msg:
            print(f'    -> {msg}')

failed_tests = []
for suite in data.get('testResults', []):
    for t in suite.get('assertionResults', []):
        if t.get('status') == 'failed':
            failed_tests.append(t.get('fullName', ''))

if failed_tests:
    print(f'\n  Individual failed tests ({len(failed_tests)}):')
    for ft in failed_tests:
        print(f'    x {ft}')
PYEOF

echo ""
echo "=== Summary ==="
echo "API:  $API_SRC source files | $API_TESTS test files"
echo "Web:  $WEB_SRC source files | $WEB_TESTS test files"
echo "Tests: $PASS passed | $FAIL failed | $TOTAL total"