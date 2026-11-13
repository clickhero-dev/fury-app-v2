import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const app = 'http://127.0.0.1:5175';

test('trial preserva sessão ao navegar, abrir outra aba e reiniciar o navegador', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'fury-session-e2e-'));
  let context: BrowserContext | undefined;
  const calls: string[] = [];
  async function startBrowser() {
    const browser = await chromium.launchPersistentContext(profile, { headless: true });
    await browser.route('http://127.0.0.1:3100/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/public/trial/access') {
        calls.push(path);
        await route.fulfill({ json: { success: true, data: { token: 'trial-token', refreshToken: 'trial-refresh', user: { id: 'trial-user', name: 'Ana', email: 'ana@example.test', role: 'owner', tenantId: 'trial-tenant', mustChangePassword: true } } } });
      } else if (path === '/api/policy/current') {
        await route.fulfill({ json: { data: { currentVersion: 'v1', currentVersionId: 'v1', accepted: true, content: null } } });
      } else if (path === '/api/billing/subscription') {
        await route.fulfill({ json: { data: { status: 'trial', trialEndsAt: '2099-01-01T00:00:00.000Z', currentPeriodEnd: '2099-01-01T00:00:00.000Z' } } });
      } else if (path === '/api/rbac/blocked-views' || path === '/api/notifications') {
        await route.fulfill({ json: { data: { blocked: [], items: [], nextCursor: null, unreadCount: 0 } } });
      } else {
        await route.fulfill({ json: { success: true, data: {} } });
      }
    });
    return browser;
  }
  try {
    context = await startBrowser();
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(`${app}/trial/acesso#token=${'a'.repeat(64)}`);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('refreshToken'))).toBe('trial-refresh');
    await page.goto(`${app}/configuracoes`);
    await expect(page).toHaveURL(/\/configuracoes/);
    const anotherTab = await context.newPage();
    await anotherTab.goto(`${app}/dashboard`);
    await expect(anotherTab).toHaveURL(/\/dashboard$/);
    expect(await anotherTab.evaluate(() => localStorage.getItem('token'))).toBe('trial-token');
    await context.close();
    context = await startBrowser();
    const reopened = context.pages()[0] ?? await context.newPage();
    await reopened.goto(`${app}/configuracoes`);
    await expect(reopened).toHaveURL(/\/configuracoes/);
    expect(await reopened.evaluate(() => [localStorage.getItem('token'), localStorage.getItem('refreshToken')])).toEqual(['trial-token', 'trial-refresh']);
    expect(calls).toEqual(['/api/public/trial/access']);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
