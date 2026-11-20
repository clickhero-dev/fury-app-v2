import { expect, test } from '@playwright/test';

test('falha temporária aos cinco minutos não desloga e a próxima tentativa recupera', async ({ page }) => {
  let calls = 0;
  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    if (route.request().url().endsWith('/auth/refresh')) {
      calls++;
      if (calls === 1) {
        await route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } });
      } else {
        await route.fulfill({ json: { data: { tokens: { accessToken: 'novo-acesso', refreshToken: 'sessao' } } } });
      }
      return;
    }
    await route.fulfill({ json: { success: true, data: {} } });
  });
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem('token', 'acesso');
    localStorage.setItem('refreshToken', 'sessao');
    localStorage.setItem('user', JSON.stringify({ email: 'teste@example.com', tenantId: 'tenant', role: 'owner' }));
  });
  await page.goto('/login');
  await expect(page.locator('#root')).not.toBeEmpty();
  await page.clock.fastForward(5 * 60 * 1000);
  await expect.poll(() => calls).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('refreshToken'))).toBe('sessao');
  await page.clock.fastForward(5 * 60 * 1000);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBe('novo-acesso');
  expect(calls).toBe(2);
});

test('duas abas permanecem autenticadas durante renovação simultânea', async ({ browser }) => {
  const context = await browser.newContext();
  let calls = 0;
  await context.route('http://127.0.0.1:3100/api/**', async (route) => {
    if (route.request().url().endsWith('/auth/refresh')) {
      calls++;
      await route.fulfill({ json: { data: { tokens: { accessToken: 'renovado', refreshToken: 'sessao' } } } });
    } else {
      await route.fulfill({ json: { success: true, data: {} } });
    }
  });
  await context.addInitScript(() => {
    if (!localStorage.getItem('refreshToken')) {
      localStorage.setItem('token', 'acesso');
      localStorage.setItem('refreshToken', 'sessao');
      localStorage.setItem('user', JSON.stringify({ email: 'teste@example.com', tenantId: 'tenant', role: 'owner' }));
    }
  });
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.clock.install(), second.clock.install()]);
  await Promise.all([first.goto('/login'), second.goto('/login')]);
  await Promise.all([expect(first.locator('#root')).not.toBeEmpty(), expect(second.locator('#root')).not.toBeEmpty()]);
  await Promise.all([first.clock.fastForward(300_000), second.clock.fastForward(300_000)]);
  await expect.poll(() => calls).toBeGreaterThan(0);
  await expect.poll(() => first.evaluate(() => localStorage.getItem('token'))).toBe('renovado');
  expect(await second.evaluate(() => localStorage.getItem('refreshToken'))).toBe('sessao');
  await context.close();
});
