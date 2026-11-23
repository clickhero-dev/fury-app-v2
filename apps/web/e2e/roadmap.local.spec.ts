import { expect, test } from '@playwright/test';

/*
Funcionalidade: consultar o Roadmap público no navegador

Cenário: visitante acessa o estado vazio
  Dado que não há sessão nem marcos publicados
  Quando acessa a rota /roadmap
  Então vê uma mensagem compreensível sem promessas obsoletas

Cenário: visitante usa a página em viewport estreita
  Dado um celular com 320px de largura
  Quando acessa o Roadmap
  Então o conteúdo cabe na viewport e o título continua visível
*/
test.describe('Roadmap público', () => {
  test('mostra o estado vazio e mantém foco acessível', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('fury-theme', 'light');
      document.documentElement.dataset.theme = 'claro';
      document.documentElement.classList.remove('dark');
    });

    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/roadmap');
    await expect(page.getByRole('heading', { name: 'Roadmap do Ady', level: 1 })).toBeVisible();
    await expect(page.getByText('Estamos atualizando nosso roadmap. Volte em breve para acompanhar as novidades.')).toBeVisible();
    await expect(page.getByText(/Google|WhatsApp/i)).not.toBeVisible();

    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => ({
      tagName: document.activeElement?.tagName,
      visible: document.activeElement instanceof HTMLElement && document.activeElement.checkVisibility(),
    }))).toEqual({ tagName: 'A', visible: true });
    await expect.poll(() => consoleErrors).toEqual([]);
    await page.screenshot({ path: 'test-results/roadmap-empty-light.png', fullPage: true });
  });

  test('é utilizável em 320px sem overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.addInitScript(() => {
      localStorage.setItem('fury-theme', 'dark');
      document.documentElement.dataset.theme = 'escuro';
      document.documentElement.classList.add('dark');
    });
    await page.goto('/roadmap');

    await expect(page.getByRole('heading', { name: 'Roadmap do Ady', level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/roadmap-empty-dark-mobile.png', fullPage: true });
  });
});
