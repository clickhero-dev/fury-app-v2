import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReadiness, checkReadiness } from './qa-readiness.mjs';

const config = { margin: '2', owner: 'Equipe QA' };
const subscription = { status: 'active', currentPeriodEnd: '2099-01-01', creativesRemaining: 3, plan: { limits: { creativesPerMonth: 20 } } };
describe('Funcionalidade: pré-voo da jornada QA', () => {
  it('aceita o limiar de uma geração e margem aprovada', () => {
    assert.equal(evaluateReadiness(config, subscription).ok, true);
    assert.equal(evaluateReadiness(config, { ...subscription, creativesRemaining: 4 }).ok, true);
  });
  it('rejeita cota insuficiente, assinatura inválida e configuração ausente', () => {
    assert.equal(evaluateReadiness(config, { ...subscription, creativesRemaining: 2 }).reason, 'quota_insufficient');
    assert.equal(evaluateReadiness(config, { ...subscription, status: 'inactive' }).reason, 'ineligible');
    assert.equal(evaluateReadiness({}, subscription).reason, 'configuration');
    assert.equal(evaluateReadiness(config, null).reason, 'unknown');
    assert.equal(evaluateReadiness(config, { ...subscription, creativesRemaining: null }).reason, 'unknown');
  });
  it('distingue permissão, indisponibilidade e timeout sem divulgar corpo ou exceção', async () => {
    for (const [request, reason] of [
      [async () => ({ status: () => 403, ok: () => false }), 'permission'],
      [async () => ({ status: () => 503, ok: () => false }), 'unavailable'],
      [async () => { throw new Error('secret timeout'); }, 'timeout'],
    ]) {
      const result = await checkReadiness(config, request);
      assert.equal(result.reason, reason);
      assert.ok(!JSON.stringify(result).includes('secret'));
    }
  });
});
