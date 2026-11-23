/*
# Language: pt-BR

Funcionalidade: recuperação de token Meta expirado na seleção de ativos

  Cenário: erro 190 mostra reconexão sem fazer retry automático
    Dado uma pessoa autenticada na seleção de ativos
    E que a API retorna 401/META_TOKEN_EXPIRED ao listar as Business Managers
    Quando a janela recebe foco
    Então a tela orienta a reconectar, não apresenta o estado vazio e não repete a chamada

  Cenário: pessoa inicia a reconexão explicitamente
    Dado o erro de token expirado exibido na seleção de ativos
    Quando escolhe "Reconectar Meta"
    Então o OAuth é aberto com context=onboarding e rerequest=true
*/
import { expect, test } from '@playwright/test';

test('Cenário: erro 190 orienta reconexão e só tenta novamente por ação explícita', async ({ page }) => {
  let businessRequests = 0;
  let authUrl: URL | undefined;
  const webOrigin = `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? '5174'}`;

  await page.addInitScript(() => {
    localStorage.setItem('token', 'e2e-meta-token');
    localStorage.setItem('refreshToken', 'e2e-meta-refresh-token');
    localStorage.setItem('user', JSON.stringify({
      name: 'E2E Meta',
      email: 'e2e-meta@example.test',
      tenantId: 'e2e-meta-tenant',
      role: 'user',
    }));
  });

  await page.route('**/meta/businesses**', async (route) => {
    businessRequests += 1;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'META_TOKEN_EXPIRED', message: 'Token Meta inválido ou expirado.' },
      }),
    });
  });
  await page.route('**/meta/auth/url**', async (route) => {
    authUrl = new URL(route.request().url());
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { authUrl: `${webOrigin}/reconexao-meta-e2e` },
      }),
    });
  });

  await page.goto('/onboarding/selecionar-conta');

  await expect(page.getByRole('alert')).toContainText('Sua conexão com a Meta precisa de atenção');
  await expect(page.getByRole('button', { name: 'Reconectar Meta' })).toBeVisible();
  await expect(page.getByText('Nenhuma Business Manager encontrada')).toHaveCount(0);
  expect(businessRequests).toBe(1);

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(150);
  expect(businessRequests).toBe(1);

  await Promise.all([
    page.waitForURL('**/reconexao-meta-e2e'),
    page.getByRole('button', { name: 'Reconectar Meta' }).click(),
  ]);

  expect(authUrl?.searchParams.get('context')).toBe('onboarding');
  expect(authUrl?.searchParams.get('rerequest')).toBe('true');
  expect(authUrl?.searchParams.get('frontendUrl')).toBe(webOrigin);
});
