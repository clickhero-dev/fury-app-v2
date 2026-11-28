/* # language: pt-BR
Funcionalidade: QA de PR sem publicação nem geração paga
  Cenário: login e navegação real usam somente leituras após autenticar
  Cenário: o navegador bloqueia qualquer tentativa de mutação antes da API
*/
import { expect, test } from '@playwright/test';
import { installReadOnlyGuard, readOnlyJourney } from '../e2e-qa/read-only-journey';

const apiURL = 'http://127.0.0.1:3100/api';
test('jornada padrão autentica e navega sem mutações de produto', async ({ page }) => {
  const mutations: string[] = [];
  await page.route(`${apiURL}/**`, async route => {
    const path = new URL(route.request().url()).pathname.replace('/api', '');
    if (route.request().method() === 'POST') mutations.push(path);
    const data = (value: unknown) => route.fulfill({ json: { data: value } });
    if (path === '/auth/login') return data({ token: 'mock', refreshToken: 'mock', user: { role: 'owner', tenantId: 'test', name: 'Teste' }, policy: { currentVersion: '1', accepted: true } });
    if (path === '/billing/subscription') return data({ status: 'active', currentPeriodEnd: '2100-01-01' });
    if (path === '/rbac/blocked-views') return data({ blocked: [] });
    if (path === '/chat/conversations') return route.fulfill({ json: [] });
    if (path === '/v2/dashboard/demo') return data({ demo: false });
    if (path === '/v2/metrics/summary') return data({ summary: { spend: 0, roas: 0, cpa: 0, conversions: 0 } });
    return data([]);
  });
  await readOnlyJourney(page, { apiURL, email: 'test@example.invalid', password: 'mock-password' });
  expect(mutations).toEqual(['/auth/login']);
});

test('bloqueia criação, confirmação e exclusão antes de chegar à API', async ({ page }) => {
  const forwarded: string[] = [];
  await page.route(`${apiURL}/**`, async route => {
    forwarded.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: {} });
  });
  const blocked = await installReadOnlyGuard(page, apiURL);
  await page.goto('/login');
  for (const [path, method] of [
    ['/campaigns', 'POST'], ['/chat/approvals/proposal/confirm', 'POST'], ['/studio/assets/asset', 'DELETE'],
  ]) {
    const success = await page.evaluate(async ({ url, method }) => {
      try { await fetch(url, { method }); return true; } catch { return false; }
    }, { url: apiURL + path, method });
    expect(success).toBe(false);
  }
  expect(blocked).toEqual(['POST /api/campaigns', 'POST /api/chat/approvals/proposal/confirm', 'DELETE /api/studio/assets/asset']);
  expect(forwarded).toEqual([]);
});
