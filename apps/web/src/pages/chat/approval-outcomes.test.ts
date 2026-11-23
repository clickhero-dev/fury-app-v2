/*
Funcionalidade: motivos seguros de recusa
Cenário: código conhecido com estado confirmado
Dado um código de plano, limite ou permissão registrado como falha
Quando a resposta ou o histórico é apresentado
Então somente a mensagem fixa é exibida, nunca o texto arbitrário recebido
Cenário: retorno ambíguo ou malformado
Dado um estado, código ou status HTTP incompatível
Quando a resposta é classificada
Então ela não é apresentada como recusa definitiva
Cenário: já existe evidência de execução
Dado um resultado com job ou mídia gerada junto de um código de recusa
Quando o histórico é classificado
Então o código não apaga a incerteza nem a evidência de execução
*/
import { describe, expect, it } from 'vitest';
import { approvalFailureFromResponse, approvalFailureFromResult } from './approval-outcomes';

const cases = [
  ['VIDEO_NOT_IN_PLAN', 'A criação de vídeos não está disponível no seu plano atual.'],
  ['VIDEO_QUOTA_EXCEEDED', 'O limite de criação de vídeos deste período foi atingido.'],
  ['MODIFICATION_QUOTA_EXCEEDED', 'O limite de alterações deste vídeo foi atingido.'],
  ['SERVICE_BLOCKED', 'Esta ação não está disponível para sua conta.'],
] as const;

describe('Motivo de recusa', () => {
  it.each(cases)('mostra somente mensagem fixa para %s', (code, message) => {
    expect(approvalFailureFromResponse(403, { detail: { status: 'failed', code, message: '<script>texto externo</script>' } })).toEqual({ code, message });
    expect(approvalFailureFromResult('failed', { code, error: 'credencial fictícia que não deve aparecer' })).toEqual({ code, message });
  });

  it.each([400, 401, 404, 409, 500, 502])('não interpreta HTTP%s como recusa conhecida', status => {
    expect(approvalFailureFromResponse(status, { detail: { status: 'failed', code: 'VIDEO_NOT_IN_PLAN' } })).toBeNull();
  });

  it.each([null, [], 'failed', {}, { detail: 'VIDEO_NOT_IN_PLAN' }, { detail: { status: 'unknown', code: 'VIDEO_NOT_IN_PLAN' } }, { detail: { status: 'failed', code: 'EXTERNAL_PROVIDER' } }, { detail: { status: 'failed', code: 'constructor' } }, { detail: { status: 'failed', code: '__proto__' } }])('mantém retorno malformado ou desconhecido como incerto: %j', body => {
    expect(approvalFailureFromResponse(403, body)).toBeNull();
  });

  it.each(['pending', 'processing', 'unknown', 'completed', 'expired'])('não sobrescreve estado %s pelo código de erro', status => {
    expect(approvalFailureFromResult(status, { code: 'VIDEO_NOT_IN_PLAN' })).toBeNull();
  });

  it.each([null, 'VIDEO_NOT_IN_PLAN', {}, { code: 'toString' }, { code: 'UNKNOWN_CODE' }])('não inventa motivo de uma falha histórica: %j', result => {
    expect(approvalFailureFromResult('failed', result)).toBeNull();
  });

  it.each([{ jobId: 'job-1' }, { job: { status: 'unknown' } }, { videoUrl: 'https://example.test/video.mp4' }, { imageUrl: 'https://example.test/image.png' }])('não classifica uma execução contraditória como recusa: %j', evidence => {
    expect(approvalFailureFromResult('failed', { code: 'VIDEO_NOT_IN_PLAN', ...evidence })).toBeNull();
  });
});
