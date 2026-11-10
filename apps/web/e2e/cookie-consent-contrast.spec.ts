import { expect, test } from '@playwright/test';

function contrastRatio(foreground: [number, number, number], background: [number, number, number]) {
  const luminance = ([red, green, blue]: [number, number, number]) => {
    const channel = (value: number) => {
      const normalized = value / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  };

  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('aceitar cookies tem contraste AA no modo claro e persiste a escolha', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-cookie-consent-initialized')) {
      document.cookie = 'ch_consent=; Max-Age=0; Path=/';
      sessionStorage.setItem('e2e-cookie-consent-initialized', 'true');
    }
    localStorage.setItem('fury-theme', 'light');
    document.documentElement.classList.remove('dark');
  });

  await page.goto('/');

  const accept = page.getByRole('button', { name: 'Aceitar todos' });
  await expect(accept).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  const styles = await accept.evaluate((button) => {
    const computed = getComputedStyle(button);
    return { background: computed.backgroundColor, color: computed.color, classes: button.className };
  });
  expect(styles.background).toBe('rgb(23, 112, 138)');
  expect(styles.classes).toContain('cookie-consent-primary');
  expect(styles.color).toBe('rgb(255, 255, 255)');
  expect(contrastRatio([23, 112, 138], [255, 255, 255])).toBeGreaterThanOrEqual(4.5);

  await accept.focus();
  await expect(accept).toBeFocused();
  await accept.click();
  await expect(page.getByRole('dialog', { name: 'Consentimento de cookies' })).toBeHidden();

  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Consentimento de cookies' })).toHaveCount(0);
});
