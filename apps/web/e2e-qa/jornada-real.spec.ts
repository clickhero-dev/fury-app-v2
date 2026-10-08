/*
# Language: pt-BR

Funcionalidade: jornada real do cliente (QA com dados reais, sem mocks)

  Cenário: login, criar campanha, pausar campanha e gerar imagem
    Dado a conta de teste (QA_EMAIL/QA_PASSWORD) com Meta conectado
    Quando o fluxo é feito pela interface, esperando a resposta real de cada etapa
    Então cada etapa só passa após o retorno da API e a conferência na listagem
    E ao final (sucesso ou falha) a campanha é pausada e arquivada e a imagem arquivada
*/
import { expect, test, type Page, type Response } from '@playwright/test';

const apiURL = process.env.QA_API_URL ?? 'http://localhost:3000/api';
// credenciais via GitHub Secrets no CI, variáveis de ambiente local
const email = process.env.QA_EMAIL ?? '';
const password = process.env.QA_PASSWORD ?? '';
const whatsapp = '55981286344';

const stamp = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
  .format(new Date())
  .replace(',', '');
const label = `Anúncio QA ${stamp}`;
const adText = `${label} - campanha de teste, pode ignorar.`;
const imagePrompt = `${label}: xícara de café sobre mesa de madeira, luz natural, fundo claro e limpo`;

type Campaign = { id: string; name: string; status: string };
type Asset = { id: string };

function log(msg: string) {
  console.log(`[QA ${new Date().toISOString()}] ${msg}`);
}

// executa a ação e espera a resposta real da API, sem tempo fixo
async function awaitApi(
  page: Page,
  method: string,
  match: (path: string) => boolean,
  action: () => Promise<void>,
  timeout: number,
) {
  const started = Date.now();
  const [res] = await Promise.all([
    page.waitForResponse((r: Response) => r.request().method() === method && match(new URL(r.url()).pathname), {
      timeout,
    }),
    action(),
  ]);
  const path = new URL(res.url()).pathname;
  const body = await res.json().catch(() => null);
  log(`${method} ${path} -> ${res.status()} em ${Math.round((Date.now() - started) / 1000)}s`);
  if (!res.ok()) {
    const err = body?.error;
    const detail = err?.message ? `${err.code ?? 'ERRO'}: ${err.message}` : err ?? JSON.stringify(body)?.slice(0, 300);
    throw new Error(`${method} ${path} falhou (${res.status()}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  return body;
}

function apiClient(page: Page, getToken: () => string) {
  const headers = () => ({ Authorization: `Bearer ${getToken()}` });
  return {
    async campaigns(): Promise<Campaign[]> {
      const res = await page.request.get(`${apiURL}/campaigns`, { headers: headers(), params: { limit: 100 } });
      expect(res.ok(), `GET /campaigns -> ${res.status()}`).toBeTruthy();
      return ((await res.json()).data ?? []) as Campaign[];
    },
    // lista do painel: lê do Meta, usa o id do Meta
    async metaCampaigns(): Promise<Campaign[]> {
      const res = await page.request.get(`${apiURL}/v2/campaigns`, { headers: headers() });
      expect(res.ok(), `GET /v2/campaigns -> ${res.status()}`).toBeTruthy();
      return ((await res.json()).data ?? []) as Campaign[];
    },
    async quota(): Promise<{ remaining: number | null; limit: number | null }> {
      const res = await page.request.get(`${apiURL}/studio/assets`, { headers: headers(), params: { limit: 1 } });
      expect(res.ok(), `GET /studio/assets -> ${res.status()}`).toBeTruthy();
      const body = await res.json();
      return { remaining: body.creativesRemaining ?? null, limit: body.creativesLimit ?? null };
    },
    async assets(): Promise<Asset[]> {
      const res = await page.request.get(`${apiURL}/studio/assets`, { headers: headers(), params: { limit: 100 } });
      expect(res.ok(), `GET /studio/assets -> ${res.status()}`).toBeTruthy();
      return ((await res.json()).assets ?? []) as Asset[];
    },
    async send(method: 'patch' | 'delete', path: string) {
      const res = await page.request[method](`${apiURL}${path}`, { headers: headers() });
      log(`${method.toUpperCase()} ${path} -> ${res.status()} (limpeza)`);
      if (!res.ok()) throw new Error(`${method.toUpperCase()} ${path} falhou (${res.status()}): ${(await res.text()).slice(0, 300)}`);
    },
  };
}

test('jornada real: login, criar campanha, pausar campanha e gerar imagem', async ({ page }) => {
  if (!email || !password) {
    throw new Error('Defina QA_EMAIL e QA_PASSWORD (GitHub Secrets no CI, variáveis de ambiente local).');
  }
  let token = '';
  let campaignId: string | undefined;
  let assetId: string | undefined;
  const api = apiClient(page, () => token);

  // banner de cookies pode cobrir botões a qualquer momento
  await page.addLocatorHandler(page.getByRole('button', { name: 'Somente essenciais' }), async (btn) => {
    await btn.click();
  });

  log(`Execução: "${label}" contra ${apiURL}`);
  let failed = false;
  try {
    await test.step('Login', async () => {
      await page.goto('/login');
      await page.locator('input[type=email]').fill(email);
      await page.locator('input[type=password]').fill(password);
      await awaitApi(
        page,
        'POST',
        (p) => p.endsWith('/auth/login'),
        () => page.getByRole('button', { name: 'Entrar', exact: true }).click(),
        60_000,
      );
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
      token = (await page.evaluate(() => localStorage.getItem('token'))) ?? '';
      expect(token, 'token salvo após login').not.toBe('');
    });

    await test.step('Criar campanha (wizard)', async () => {
      await page.goto('/criar-campanha');
      const next = page.getByRole('button', { name: 'Continuar' });

      // objetivo: formulário de captação + WhatsApp
      await page.getByRole('button', { name: /Formulário de captação/ }).click();
      const phone = page.locator('input[inputmode="tel"]');
      await expect(phone).toBeVisible({ timeout: 60_000 });
      await phone.fill(whatsapp);
      await expect(phone).toHaveValue('(55) 98128-6344');
      await expect(next).toBeEnabled({ timeout: 60_000 });
      await next.click();

      // criativo: o mais antigo da galeria (último da grade)
      await expect(page.getByRole('heading', { name: 'Qual imagem vai usar?' })).toBeVisible();
      const gallery = page.locator('[data-testid="wizard-gallery-asset"]:not([disabled])');
      await expect(gallery.first()).toBeVisible({ timeout: 60_000 });
      await gallery.last().click();
      await expect(page.getByText(/1\/\d+ selecionadas/).first()).toBeVisible();
      await page.getByPlaceholder('Ex: Promoção imperdível este mês!').fill(label);
      await page.getByPlaceholder('Descreva sua oferta de forma clara e atrativa.').fill(adText);
      await expect(next).toBeEnabled();
      await next.click();

      // orçamento mínimo da plataforma
      await expect(page.getByRole('heading', { name: 'Quanto vai investir?' })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: 'R$7', exact: true }).click();
      await expect(next).toBeEnabled();
      await next.click();

      // publicar e esperar o retorno real do Meta
      await expect(page.getByRole('heading', { name: 'Revisão e Publicação' }).last()).toBeVisible();
      const publish = page.getByRole('button', { name: 'Publicar Campanha' });
      await expect(publish, 'Publicar habilitado (público configurado)').toBeEnabled({ timeout: 30_000 });
      const created = await awaitApi(
        page,
        'POST',
        (p) => p.endsWith('/campaigns/create-wizard'),
        () => publish.click(),
        10 * 60_000,
      );
      campaignId = created?.data?.campaign_id ?? created?.campaign_id;
      expect(campaignId, 'campaign_id na resposta da criação').toBeTruthy();
      log(`Campanha criada: ${campaignId}`);
      await expect(page.getByText('Campanha publicada com sucesso!')).toBeVisible();

      await expect
        .poll(async () => (await api.campaigns()).find((c) => c.id === campaignId)?.name, {
          message: 'campanha aparece na listagem',
          timeout: 2 * 60_000,
        })
        .toBe(label);
    });

    await test.step('Pausar campanha', async () => {
      await page.goto('/campanhas');
      await page.getByPlaceholder('Buscar campanha...').fill(label);
      const row = page.locator('tr', { hasText: label });
      await expect(row).toBeVisible({ timeout: 2 * 60_000 });
      await row.getByRole('button', { name: 'Pausar' }).click();
      await awaitApi(
        page,
        'PATCH',
        // painel usa o id do Meta na URL
        (p) => /\/campaigns\/[^/]+\/pause$/.test(p),
        () => page.getByRole('button', { name: 'Confirmar pausa' }).click(),
        5 * 60_000,
      );
      await expect(row.getByText('Pausado')).toBeVisible({ timeout: 2 * 60_000 });

      await expect
        .poll(async () => (await api.campaigns()).find((c) => c.id === campaignId)?.status, {
          message: 'status pausado na listagem',
          timeout: 2 * 60_000,
        })
        .toBe('paused');
    });

    await test.step('Gerar imagem (Estúdio)', async () => {
      // sem cota o botão fica desabilitado: falha clara em vez de esperar
      const { remaining, limit } = await api.quota();
      log(`Cota de imagens: ${remaining ?? 'ilimitada'} de ${limit ?? 'ilimitada'} restantes`);
      if (remaining !== null && remaining <= 0) {
        throw new Error(
          `SEM COTA DE IMAGEM: a conta ${email} usou ${limit} de ${limit} criativos do mês. ` +
            'Não é possível gerar a imagem até a cota renovar ou o plano ser ampliado.',
        );
      }

      await page.goto('/estudio');
      const quickCreate = page.getByRole('button', { name: 'Criação rápida' });
      await expect(quickCreate, 'Criação rápida habilitado').toBeEnabled({ timeout: 30_000 });
      await quickCreate.click();
      await page.getByPlaceholder(/Anúncio fashion minimalista/).fill(imagePrompt);
      const generate = page.getByRole('button', { name: 'Gerar imagem' });
      await expect(generate, 'Gerar imagem habilitado (cota mensal disponível)').toBeEnabled({ timeout: 30_000 });
      const generated = await awaitApi(
        page,
        'POST',
        (p) => p.endsWith('/studio/ai/generate-image'),
        () => generate.click(),
        10 * 60_000,
      );
      assetId = generated?.creativeAssetId;
      expect(assetId, 'creativeAssetId na resposta da geração').toBeTruthy();
      log(`Imagem criada: ${assetId}`);
      await expect(page.getByText('Não foi possível gerar o anúncio')).toHaveCount(0);

      await expect
        .poll(async () => (await api.assets()).some((a) => a.id === assetId), {
          message: 'imagem aparece na biblioteca',
          timeout: 2 * 60_000,
        })
        .toBe(true);
    });
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    // limpeza sempre roda: pausa se ativa, arquiva campanha e imagem
    const cleanupErrors: string[] = [];
    if (token) {
      try {
        const local = (await api.campaigns()).find((c) =>
          campaignId ? c.id === campaignId : c.name === label && c.status !== 'archived',
        );
        // falha no meio da criação deixa a campanha só no Meta
        const meta = (await api.metaCampaigns()).find((c) => c.name === label);
        if (local || meta) {
          log(`Limpeza: campanha local=${local?.id}:${local?.status} meta=${meta?.id}:${meta?.status}`);
          const pauseId = meta?.id ?? local!.id;
          if (local?.status === 'active' || meta?.status?.toUpperCase() === 'ACTIVE') {
            await api.send('patch', `/campaigns/${pauseId}/pause`);
          }
          if (local?.status !== 'archived') await api.send('delete', `/campaigns/${local?.id ?? pauseId}`);
        } else {
          log('Limpeza: nenhuma campanha desta execução encontrada');
        }
      } catch (e) {
        cleanupErrors.push(`campanha: ${(e as Error).message}`);
      }
      if (assetId) {
        try {
          await api.send('delete', `/studio/assets/${assetId}`);
        } catch (e) {
          cleanupErrors.push(`imagem: ${(e as Error).message}`);
        }
      }
    }
    if (cleanupErrors.length) {
      console.error(`[QA] Falha na limpeza:\n${cleanupErrors.join('\n')}`);
      // não mascara o erro original da jornada
      if (!failed) throw new Error(`Limpeza falhou: ${cleanupErrors.join(' | ')}`);
    }
  }
});
