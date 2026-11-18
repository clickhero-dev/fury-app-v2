import { expect, type Page } from '@playwright/test';

/** Bloqueia mutações de produto antes da rede; login/refresh apenas abrem a sessão QA. */
export async function installReadOnlyGuard(page: Page, apiURL: string) {
  const blocked: string[] = [];
  const base = apiURL.replace(/\/$/, '');
  const authPaths = ['/auth/login', '/auth/refresh'].map(path => new URL(base + path).pathname);
  await page.route(`${base}/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || (request.method() === 'POST' && authPaths.includes(path))) {
      await route.fallback();
      return;
    }
    blocked.push(`${request.method()} ${path}`);
    await route.abort('blockedbyclient');
  });
  return blocked;
}

export async function readOnlyJourney(page: Page, options: { apiURL: string; email: string; password: string }) {
  const blocked = await installReadOnlyGuard(page, options.apiURL);
  await page.addLocatorHandler(page.getByRole('button', { name: 'Somente essenciais' }), async button => { await button.click(); });
  await page.goto('/login');
  await page.locator('input[type=email]').fill(options.email);
  await page.locator('input[type=password]').fill(options.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'O que vamos fazer hoje?' })).toBeVisible();
  for (const label of ['Não sei por onde começar', 'Criar conteúdo para minhas redes', 'Planejar minha semana', 'Atrair mais clientes']) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Não sei por onde começar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Não sei por onde começar', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mensagem' })).toBeVisible();
  // Apenas abrir o fluxo; enviar mensagens poderia chamar um provedor LLM.
  await page.goBack();
  const menu = page.getByRole('button', { name: 'Abrir menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name: 'Painel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Painel', exact: true })).toBeVisible();
  expect(blocked, 'nenhuma mutação de produto durante a jornada de leitura').toEqual([]);
}
