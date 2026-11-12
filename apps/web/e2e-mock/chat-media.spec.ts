/// <reference types="node" />
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/*
Funcionalidade: ditar e anexar material sem perder o controle da conversa
Cenário: revisar o ditado antes de enviar
Dado que o microfone e a transcrição estão isolados para teste
Quando a pessoa grava e para
Então o texto aparece no rascunho e nenhuma mensagem é enviada automaticamente
Cenário: enviar imagem, PDF e vídeo com histórico persistido
Dado que a pessoa seleciona três arquivos sintéticos válidos
Quando os uploads terminam e ela envia
Então os IDs privados seguem na mensagem e os anexos reaparecem após recarregar
Cenário: falhas e cancelamento
Dado que upload ou permissão de microfone falha
Quando a pessoa tenta usar o recurso
Então recebe um erro útil sem perder texto, enviar mensagem ou manter o microfone aberto
Estas são jornadas de frontend com API/provedor simulados, não prova de leitura real pela IA.
*/

const conversationId = '11111111-1111-4111-8111-111111111111';
const fixtureDir = path.resolve('e2e-mock/fixtures/chat-media');
const fixtures = ['referencia.png', 'briefing.pdf', 'cena.mp4'];
type Attachment = { id: string; filename: string; mimeType: string; sizeBytes: number };
type Message = { id: string; role: string; content: string; attachments?: Attachment[] };

async function isolateMedia(page: Page, options: { theme?: 'light' | 'dark'; uploadFails?: boolean; transcriptionFails?: boolean } = {}) {
  const state = { creates: 0, transcriptions: 0, uploads: [] as Attachment[], messages: [] as Message[], sends: [] as { content?: string; attachmentIds?: string[] }[], downloads: 0 };
  let created = false;
  await page.addInitScript(({ theme }) => {
    localStorage.setItem('token', 'isolated-chat-media-qa');
    localStorage.setItem('refreshToken', 'isolated-chat-media-qa-refresh');
    localStorage.setItem('fury-theme', theme);
    localStorage.setItem('user', JSON.stringify({ name: 'QA', role: 'admin', tenantId: 'isolated', email: 'qa@example.invalid' }));
    sessionStorage.clear();
  }, { theme: options.theme ?? 'light' });
  await page.route('http://127.0.0.1:3100/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const base = `/api/chat/conversations/${conversationId}`;
    if (url.pathname === '/api/rbac/blocked-views') return route.fulfill({ json: { data: { blocked: [] } } });
    if (url.pathname.endsWith('/plans')) return route.fulfill({ json: { plans: [] } });
    if (url.pathname === '/api/chat/transcriptions') {
      state.transcriptions++;
      expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=');
      const form = await new Request('https://fixture.invalid', { method: 'POST', headers: { 'Content-Type': request.headers()['content-type'] }, body: new Uint8Array(request.postDataBuffer() ?? []) }).formData();
      const audio = form.get('audio');
      expect(audio).not.toBeNull();
      expect(typeof audio).not.toBe('string');
      if (options.transcriptionFails) return route.fulfill({ status: 502, json: { error: 'Não foi possível transcrever. Tente novamente.' } });
      return route.fulfill({ json: { text: 'Quero planejar as publicações desta semana.' } });
    }
    if (url.pathname === '/api/chat/conversations' && method === 'POST') {
      state.creates++;
      created = true;
      return route.fulfill({ status: 201, json: { id: conversationId, title: 'Conversa de mídia' } });
    }
    if (url.pathname === '/api/chat/conversations') return route.fulfill({ json: created ? [{ id: conversationId, title: 'Conversa de mídia' }] : [] });
    if (url.pathname === `${base}/attachments` && method === 'POST') {
      expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=');
      if (options.uploadFails) return route.fulfill({ status: 503, json: { error: 'Não foi possível enviar o arquivo. Tente novamente.' } });
      const form = await new Request('https://fixture.invalid', { method: 'POST', headers: { 'Content-Type': request.headers()['content-type'] }, body: new Uint8Array(request.postDataBuffer() ?? []) }).formData();
      const attachments = await Promise.all(form.getAll('files').filter((file): file is File => typeof file !== 'string').map(async file => {
        expect(fixtures).toContain(file.name);
        const index = fixtures.indexOf(file.name) + 1;
        // CDP omits file bytes from intercepted multipart bodies; metadata comes
        // from the same real fixture selected in the browser, not the empty part.
        const bytes = await readFile(path.join(fixtureDir, file.name));
        return { id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`, filename: file.name, mimeType: file.type, sizeBytes: bytes.length };
      }));
      expect(attachments.length).toBeGreaterThan(0);
      state.uploads.push(...attachments);
      return route.fulfill({ status: 201, json: { attachments } });
    }
    if (url.pathname.startsWith(`${base}/attachments/`) && method === 'GET') {
      const attachment = state.uploads.find(item => url.pathname.endsWith(item.id));
      expect(request.headers().authorization).toBe('Bearer isolated-chat-media-qa');
      expect(url.search).toBe('');
      if (!attachment) return route.fulfill({ status: 404, json: { error: 'Arquivo não encontrado.' } });
      state.downloads++;
      return route.fulfill({ contentType: attachment.mimeType, body: await readFile(path.join(fixtureDir, attachment.filename)), headers: { 'Cache-Control': 'private, no-store' } });
    }
    if (url.pathname.startsWith(`${base}/attachments/`) && method === 'DELETE') return route.fulfill({ status: 204 });
    if (url.pathname === `${base}/messages` && method === 'POST') {
      const body = request.postDataJSON() as { content?: string; attachmentIds?: string[] };
      state.sends.push(body);
      const attachments = state.uploads.filter(item => body.attachmentIds?.includes(item.id));
      state.messages.push({ id: 'm-user', role: 'user', content: body.content ?? '', attachments });
      const answer = { id: 'm-assistant', role: 'assistant', content: attachments.length ? 'Recebi os arquivos sintéticos deste teste.' : 'Vamos preparar seu planejamento.' };
      state.messages.push(answer);
      return route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ message: answer })}\n\n` });
    }
    if (url.pathname === base) return route.fulfill({ json: { id: conversationId, title: 'Conversa de mídia', messages: state.messages, approvals: [] } });
    return route.fulfill({ status: 404, json: { error: 'isolated endpoint' } });
  });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Somente essenciais' }).click();
  return state;
}

async function mockMicrophone(page: Page, denied = false) {
  await page.addInitScript(({ denied }) => {
    const scope = window as unknown as { __mediaQA: { requests: number; stops: number } };
    scope.__mediaQA = { requests: 0, stops: 0 };
    const track = Object.assign(new EventTarget(), { stop: () => { scope.__mediaQA.stops++; } });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      scope.__mediaQA.requests++;
      if (denied) throw new DOMException('Permission denied', 'NotAllowedError');
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    } });
    class Recorder extends EventTarget {
      static isTypeSupported = () => true;
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        queueMicrotask(() => {
          const event = new BlobEvent('dataavailable', { data: new Blob(['synthetic browser audio fixture'], { type: this.mimeType }) });
          this.ondataavailable?.(event);
          this.dispatchEvent(event);
          this.onstop?.();
          this.dispatchEvent(new Event('stop'));
        });
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
  }, { denied });
}

for (const theme of ['light', 'dark'] as const) {
  test(`anexa imagem PDF e vídeo no celular, envia e recupera histórico — ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = await isolateMedia(page, { theme });
    await page.getByLabel('Selecionar anexos', { exact: true }).setInputFiles(fixtures.map(file => path.join(fixtureDir, file)));
    await expect.poll(() => state.uploads.length).toBe(3);
    for (const file of fixtures) await expect(page.getByText(file, { exact: true })).toBeVisible();
    const send = page.getByRole('button', { name: 'Enviar mensagem', exact: true });
    await expect(send).toBeEnabled();
    await expect(send).toBeInViewport();
    expect(state.creates).toBe(1);
    expect(state.sends).toHaveLength(0);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    await page.screenshot({ path: testInfo.outputPath(`media-${theme}-previews.png`), fullPage: true });
    await send.click();
    await expect(page.getByText('Recebi os arquivos sintéticos deste teste.', { exact: true })).toBeVisible();
    expect(state.sends).toHaveLength(1);
    expect(state.sends[0].attachmentIds?.slice().sort()).toEqual(state.uploads.map(item => item.id).sort());
    expect(state.sends[0].content ?? '').toBe('');
    await page.reload();
    await page.getByRole('button', { name: 'Mostrar conversas', exact: true }).click();
    await page.getByRole('button', { name: 'Conversa de mídia', exact: true }).click();
    for (const file of fixtures) await expect(page.getByText(file, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Visualizar referencia.png', exact: true }).click();
    await expect.poll(() => state.downloads).toBeGreaterThan(0);
    await expect(page.getByRole('img', { name: 'referencia.png', exact: true })).toBeVisible();
    await expect.poll(() => page.getByRole('img', { name: 'referencia.png', exact: true }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(`media-${theme}-history.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('ditado vira texto revisável sem enviar e libera o microfone', async ({ page }) => {
  await mockMicrophone(page);
  const state = await isolateMedia(page);
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await input.fill('Minha ideia:');
  await page.getByRole('button', { name: 'Gravar mensagem', exact: true }).click();
  await page.getByRole('button', { name: 'Parar gravação', exact: true }).click();
  await expect(input).toHaveValue(/Minha ideia:[\s\S]*Quero planejar as publicações desta semana\./);
  expect(state.transcriptions).toBe(1);
  expect(state.sends).toHaveLength(0);
  expect(state.creates).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mediaQA: { stops: number } }).__mediaQA.stops)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.getByText('Vamos preparar seu planejamento.', { exact: true })).toBeVisible();
  expect(state.sends).toHaveLength(1);
});

test('cancelar gravação preserva rascunho e não transcreve', async ({ page }) => {
  await mockMicrophone(page);
  const state = await isolateMedia(page);
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await input.fill('Não apagar esta ideia');
  await page.getByRole('button', { name: 'Gravar mensagem', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar gravação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gravar mensagem', exact: true })).toBeVisible();
  await expect(input).toHaveValue('Não apagar esta ideia');
  expect(state.transcriptions).toBe(0);
  expect(state.sends).toHaveLength(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mediaQA: { stops: number } }).__mediaQA.stops)).toBeGreaterThan(0);
});

test('permissão negada não perde rascunho nem envia mensagem', async ({ page }) => {
  await mockMicrophone(page, true);
  const state = await isolateMedia(page);
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await input.fill('Texto seguro');
  await page.getByRole('button', { name: 'Gravar mensagem', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/microfone|permissão/i);
  await expect(input).toHaveValue('Texto seguro');
  expect(state.transcriptions).toBe(0);
  expect(state.sends).toHaveLength(0);
});

test('falha de upload mantém texto e não envia anexo incompleto', async ({ page }) => {
  const state = await isolateMedia(page, { uploadFails: true });
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await input.fill('Leia meu material');
  await page.getByLabel('Selecionar anexos', { exact: true }).setInputFiles(path.join(fixtureDir, 'briefing.pdf'));
  await expect(page.getByRole('alert')).toContainText(/arquivo|enviar/i);
  await expect(input).toHaveValue('Leia meu material');
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeDisabled();
  expect(state.sends).toHaveLength(0);
});

test('falha de transcrição mantém rascunho e libera microfone', async ({ page }) => {
  await mockMicrophone(page);
  const state = await isolateMedia(page, { transcriptionFails: true });
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await input.fill('Rascunho antes do áudio');
  await page.getByRole('button', { name: 'Gravar mensagem', exact: true }).click();
  await page.getByRole('button', { name: 'Parar gravação', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/transcrev|transcri/i);
  await expect(input).toHaveValue('Rascunho antes do áudio');
  expect(state.sends).toHaveLength(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mediaQA: { stops: number } }).__mediaQA.stops)).toBeGreaterThan(0);
});
