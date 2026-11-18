"""Contrato: PRs nunca escolhem a jornada com publicação/gasto real."""
import re
import unittest
from pathlib import Path
from types import SimpleNamespace

WORKFLOW = Path(__file__).resolve().parents[2] / '.github/workflows/qa-jornada-real.yml'


class ReadOnlyQAContract(unittest.TestCase):
    def test_real_actions_require_manual_opt_in(self):
        source = WORKFLOW.read_text()
        step = re.search(r'- name: Run QA jornada real com ações reais\n(.*?)(?=\n      - name:|\Z)', source, re.S)
        self.assertIsNotNone(step, 'A jornada com custo precisa de um gate manual explícito')
        condition = re.search(r'if: (.+)', step.group(1)).group(1)
        expression = condition.replace('&&', 'and').replace('||', 'or')
        for event, opt_in, expected in [
            ('pull_request', False, False), ('pull_request', True, False),
            ('push', True, False), ('workflow_dispatch', False, False),
            ('workflow_dispatch', True, True),
        ]:
            with self.subTest(event=event, opt_in=opt_in):
                result = eval(expression, {'__builtins__': {}}, {
                    'github': SimpleNamespace(event_name=event),
                    'inputs': SimpleNamespace(allow_mutations=opt_in),
                })
                self.assertEqual(result, expected)
        self.assertIn('pnpm test:qa -- jornada-real.spec.ts', step.group(1))

    def test_safe_journey_is_the_default(self):
        source = WORKFLOW.read_text()
        self.assertRegex(source, r'allow_mutations:[\s\S]*?type: boolean\s+default: false')
        self.assertIn('pnpm test:qa -- jornada-leitura.spec.ts', source)
        self.assertIn('python scripts/ci/qa-read-only.test.py', source)


if __name__ == '__main__':
    unittest.main()
