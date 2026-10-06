/*
# Language: pt-BR

Funcionalidade: renovação de sessão no navegador

  Cenário: tokens são rotacionados após cinco minutos sem expirar a sessão
    Dado um usuário autenticado na API local
    Quando o relógio do navegador avança cinco minutos
    Então a API real recebe um refresh e a sessão continua autenticada

  Cenário: duas abas compartilham uma única rotação
    Dado a mesma sessão aberta em duas abas
    Quando ambas alcançam o ciclo de cinco minutos
    Então somente uma chamada de refresh é feita
*/
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const apiBaseUrl = 'http://127.0.0.1:3100/api';

async function createSession(request: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `e2e-refresh-${suffix}@example.test`;
  const password = 'SecurePass123!';

  const registration = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { name: 'E2E Refresh', email, password, companyName: `Empresa ${suffix}` },
  });
  expect(registration.status()).toBe(201);

  const login = await request.post(`${apiBaseUrl}/auth/login`, { data: { email, password } });
  expect(login.status()).toBe(200);
  const body = await login.json();
  return { token: body.data.token as string, refreshToken: body.data.refreshToken as string, user: body.data.user };
}

async function seedSession(page: Page, session: { token: string; refreshToken: string; user: unknown }) {
  await page.addInitScript((data: typeof session) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
  }, session);
}

test('Cenário: tokens são rotacionados após cinco minutos sem expirar a sessão', async ({ page, request }) => {
  const session = await createSession(request);
  let refreshCalls = 0;
  await page.context().route('**/api/auth/refresh', async (route) => {
    refreshCalls += 1;
    await route.continue();
  });
  await page.clock.install();
  await seedSession(page, session);
  await page.goto('/login');

  await page.clock.fastForward(5 * 60 * 1000);
  await expect.poll(() => refreshCalls).toBe(1);

  await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).not.toBe(session.token);
  const me = await page.request.get(`${apiBaseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}` },
  });
  expect(me.status()).toBe(200);
});

test('Cenário: duas abas compartilham uma única rotação', async ({ browser, request }) => {
  const session = await createSession(request);
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  let refreshCalls = 0;
  await context.route('**/api/auth/refresh', async (route) => {
    refreshCalls += 1;
    await route.continue();
  });

  await Promise.all([first.clock.install(), second.clock.install()]);
  await seedSession(first, session);
  await first.goto('http://127.0.0.1:5174/login');
  await second.goto('http://127.0.0.1:5174/login');

  await Promise.all([first.clock.fastForward(5 * 60 * 1000), second.clock.fastForward(5 * 60 * 1000)]);
  await expect.poll(() => refreshCalls).toBe(1);
  await expect.poll(() => second.evaluate(() => localStorage.getItem('token'))).not.toBe(session.token);
  await context.close();
});
