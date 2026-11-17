/*
# Language: pt-BR
Funcionalidade: contraste do aceite de cookies
  Cenário: o botão primário mantém contraste nos temas e tamanhos de tela
    Dado o banner de consentimento visível
    Quando o usuário interage com o botão de aceitar
    Então as cores computadas preservam o contraste e o foco permanece visível
*/
import { expect, test } from '@playwright/test';

function contrast(a: string, b: string) {
  const luminance = (color: string) => {
    const values = color.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number);
    return values.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  };
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

for (const theme of ['claro', 'escuro']) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    test(`${theme}, ${viewport.width}px: contraste, foco e aceite por teclado`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/login');
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'escuro');
      const button = page.getByRole('button', { name: 'Aceitar todos' });
      await expect(button).toBeVisible();
      const colors = () => button.evaluate(el => {
        const style = getComputedStyle(el);
        return { color: style.color, background: style.backgroundColor, outline: style.outlineColor, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
      });
      const rest = await colors();
      expect(rest.color).toBe('rgb(255, 255, 255)');
      expect(contrast(rest.color, rest.background)).toBeGreaterThanOrEqual(4.5);
      await button.hover();
      const hover = await colors();
      expect(hover.background).not.toBe(rest.background);
      expect(contrast(hover.color, hover.background)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.down();
      const active = await colors();
      expect(active.background).not.toBe(hover.background);
      expect(contrast(active.color, active.background)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await page.keyboard.press('Tab');
      for (let i = 0; i < 30 && !(await button.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
      const focus = await colors();
      expect(focus.outlineStyle).toBe('solid');
      expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);
      expect(contrast(focus.outline, theme === 'claro' ? 'rgb(255, 255, 255)' : 'rgb(23, 23, 26)')).toBeGreaterThanOrEqual(3);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Consentimento de cookies' })).toBeHidden();
      expect((await page.context().cookies()).find(cookie => cookie.name === 'ch_consent')?.value).toContain('all');
      await page.reload();
      await expect(page.getByRole('dialog', { name: 'Consentimento de cookies' })).toHaveCount(0);
    });
  }
}

// O botão nativo também aceita Espaço e toque em sessões independentes.
test('aceite por Espaço preserva o consentimento', async ({ page }) => {
  await page.goto('/login');
  const button = page.getByRole('button', { name: 'Aceitar todos' });
  for (let i = 0; i < 30 && !(await button.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog', { name: 'Consentimento de cookies' })).toHaveCount(0);
  expect((await page.context().cookies()).find(cookie => cookie.name === 'ch_consent')?.value).toContain('all');
});

test.describe('dispositivo com toque', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });
  test('aceite por toque fecha o banner', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Aceitar todos' }).tap();
    await expect(page.getByRole('dialog', { name: 'Consentimento de cookies' })).toHaveCount(0);
  });
});
