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
        self.assertIn('pnpm exec playwright test -c playwright.qa.config.ts e2e-qa/jornada-real.spec.ts', step.group(1))

    def test_preflight_precedes_all_product_mutations_and_cleanup(self):
        spec = (WORKFLOW.parents[2] / 'apps/web/e2e-qa/jornada-real.spec.ts').read_text()
        self.assertLess(spec.index("test.step('Pré-voo"), spec.index("test.step('Criar campanha"))
        self.assertLess(spec.index("test.step('Pré-voo"), spec.index("test.step('Gerar imagem"))
        self.assertIn('if (token && creationStarted)', spec)
        self.assertIn('if (!result.ok)', spec)

    def test_safe_journey_is_the_default(self):
        source = WORKFLOW.read_text()
        self.assertRegex(source, r'allow_mutations:[\s\S]*?type: boolean\s+default: false')
        self.assertIn('pnpm exec playwright test -c playwright.qa.config.ts e2e-qa/jornada-leitura.spec.ts', source)
        self.assertNotIn('pnpm test:qa --', source)
        spec = (WORKFLOW.parents[2] / 'apps/web/e2e-qa/jornada-real.spec.ts').read_text()
        self.assertIn("test.skip(process.env.QA_ALLOW_MUTATIONS !== 'true'", spec)
        self.assertIn("QA_ALLOW_MUTATIONS: 'true'", source)
        self.assertIn('python scripts/ci/qa-read-only.test.py', source)


if __name__ == '__main__':
    unittest.main()
