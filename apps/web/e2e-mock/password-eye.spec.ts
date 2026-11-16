import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
  test(`olhinho no login administrativo preserva senha e envio (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let submissions = 0;
    let payload: unknown;
    await page.route('**/api/auth/login', async route => {
      submissions++;
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
    });
    await page.goto('/admin/login');
    const password = page.locator('input[autocomplete="current-password"]');
    const toggle = page.locator('button[aria-controls]');
    await page.getByPlaceholder('admin@ady.com.br').fill('admin@example.com');
    await password.fill('SenhaSegura1!');
    await expect(password).toHaveAttribute('type', 'password');
    await toggle.click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveAttribute('data-ph-no-capture', 'true');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(password).toHaveValue('SenhaSegura1!');
    expect(submissions).toBe(0);
    await toggle.press('Space');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Entrar no painel' }).click();
    await expect(page.getByText('Email ou senha incorretos')).toBeVisible();
    expect(submissions).toBe(1);
    expect(payload).toEqual({ email: 'admin@example.com', password: 'SenhaSegura1!' });
    await expect(password).toHaveValue('SenhaSegura1!');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}
