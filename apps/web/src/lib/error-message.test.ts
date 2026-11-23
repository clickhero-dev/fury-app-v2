import { describe, expect, it } from 'vitest';
import { errorMessage, errorReason, readBlobError } from './error-message';

const apiErr = (status: number, error?: { code?: string; message?: string }) => ({
  isAxiosError: true,
  response: { status, data: error ? { error } : {} },
});

describe('errorMessage', () => {
  it('usa o motivo da API', () => {
    expect(errorMessage(apiErr(409, { code: 'EMAIL_EXISTS', message: 'Email já cadastrado' }), 'Não foi possível criar o usuário')).toBe(
      'Não foi possível criar o usuário. Email já cadastrado.',
    );
  });

  it('lê a mensagem na raiz (formato antigo do Kit da marca)', () => {
    const err = { isAxiosError: true, response: { status: 400, data: { success: false, message: 'Nenhum arquivo enviado' } } };
    expect(errorMessage(err, 'Não foi possível enviar a logo')).toBe('Não foi possível enviar a logo. Nenhum arquivo enviado.');
  });

  it('formato antigo em 500 continua genérico', () => {
    const err = { isAxiosError: true, response: { status: 500, data: { success: false, message: 'detalhe interno' } } };
    expect(errorReason(err)).toMatch(/^Erro no servidor/);
  });

  it('lê o motivo de erro que veio como Blob (download)', async () => {
    const blob = new Blob([JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Arquivo não encontrado' } })], { type: 'application/json' });
    const err = await readBlobError({ isAxiosError: true, response: { status: 404, data: blob } });
    expect(errorReason(err)).toBe('Arquivo não encontrado.');
  });

  it('Blob que não é JSON não quebra', async () => {
    const err = await readBlobError({ isAxiosError: true, response: { status: 400, data: new Blob(['png']) } });
    expect(errorReason(err)).toMatch(/^Não conseguimos identificar o motivo/);
  });

  it('error como código em texto usa a mensagem da raiz (rotas do Estúdio)', () => {
    const err = { isAxiosError: true, response: { status: 422, data: { error: 'preview_unavailable', message: 'Confira a imagem e o logo' } } };
    expect(errorReason(err)).toBe('Confira a imagem e o logo.');
  });

  it('message que não é texto não quebra', () => {
    const err = { isAxiosError: true, response: { status: 400, data: { error: { code: 'X', message: { a: 1 } } } } };
    expect(errorReason(err)).toMatch(/^Não conseguimos identificar o motivo/);
  });

  it('Blob grande ou que não é JSON não é lido', async () => {
    const big = new Blob(['x'.repeat(70 * 1024)], { type: 'application/json' });
    expect(errorReason(await readBlobError({ isAxiosError: true, response: { status: 400, data: big } }))).toMatch(/^Não conseguimos/);
    const html = new Blob(['<html>erro</html>'], { type: 'text/html' });
    expect(errorReason(await readBlobError({ isAxiosError: true, response: { status: 502, data: html } }))).toMatch(/^Erro no servidor/);
  });

  it('não duplica o ponto final', () => {
    expect(errorReason(apiErr(400, { code: 'VALIDATION_ERROR', message: 'Verifique o campo: Senha: mínimo de 8 caracteres.' }))).toBe(
      'Verifique o campo: Senha: mínimo de 8 caracteres.',
    );
  });

  it('sem resposta = sem conexão', () => {
    expect(errorReason({ isAxiosError: true })).toMatch(/^Sem conexão com o servidor/);
  });

  it('500 genérico não expõe detalhe', () => {
    expect(errorReason(apiErr(500, { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' }))).toMatch(/^Erro no servidor/);
    expect(errorReason(apiErr(502))).toMatch(/^Erro no servidor/);
    expect(errorReason(apiErr(500, { code: 'CONFIG', message: 'JWT_SECRET obrigatorio' }))).toMatch(/^Erro no servidor/);
  });

  it('5xx com motivo próprio mostra o motivo', () => {
    expect(errorReason(apiErr(503, { code: 'AI_UNAVAILABLE', message: 'IA indisponível no momento' }))).toBe('IA indisponível no momento.');
  });

  it('401 e 403 sem mensagem', () => {
    expect(errorReason(apiErr(401))).toMatch(/sessão expirou/);
    expect(errorReason(apiErr(403))).toMatch(/permissão/);
  });

  it('erro que não é da API', () => {
    expect(errorReason(new Error('x'))).toMatch(/^Não conseguimos identificar o motivo/);
  });
});
