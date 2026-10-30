/*
Funcionalidade: preflight seguro da jornada QA

Cenário: conta elegível
Dado assinatura ativa, Meta conectada e cota positiva
Quando o preflight avalia as respostas read-only
Então autoriza a jornada real

Cenário: conta inelegível
Dado assinatura ausente ou vencida
Quando o preflight avalia as respostas read-only
Então bloqueia a jornada sem mutações

Cenário: pré-condição desconhecida
Dado uma resposta 401, 403, timeout ou payload inválido
Quando o preflight avalia as respostas read-only
Então falha explicitamente sem classificar a conta como elegível
*/
import { describe, expect, it } from 'vitest';
import { evaluateQaPreflight, type QaPreflightInput } from './qa-jornada-preflight';

const eligible: QaPreflightInput = {
  subscription: { status: 'active', currentPeriodEnd: '2099-01-01T00:00:00.000Z' },
  metaConnections: [{ id: 'connection-1', selectedAdAccountId: 'act_1' }],
  quota: { creativesRemaining: 2, creativesLimit: 8 },
};

describe('evaluateQaPreflight', () => {
  it('autoriza somente quando assinatura, Meta e cota estão verificáveis e elegíveis', () => {
    expect(evaluateQaPreflight(eligible)).toEqual({ ok: true });
  });

  it('bloqueia assinatura ausente ou vencida com motivo sanitizado', () => {
    expect(evaluateQaPreflight({ ...eligible, subscription: null })).toEqual({
      ok: false,
      code: 'SUBSCRIPTION_INELIGIBLE',
      message: 'A conta QA não possui assinatura ou trial elegível.',
    });
    expect(
      evaluateQaPreflight({
        ...eligible,
        subscription: { status: 'active', currentPeriodEnd: '2020-01-01T00:00:00.000Z' },
      }),
    ).toMatchObject({ ok: false, code: 'SUBSCRIPTION_INELIGIBLE' });
  });

  it('bloqueia Meta sem conexão ou conta de anúncios selecionada', () => {
    expect(evaluateQaPreflight({ ...eligible, metaConnections: [] })).toMatchObject({
      ok: false,
      code: 'META_NOT_READY',
    });
    expect(
      evaluateQaPreflight({ ...eligible, metaConnections: [{ id: 'connection-1', selectedAdAccountId: null }] }),
    ).toMatchObject({ ok: false, code: 'META_NOT_READY' });
  });

  it('bloqueia cota esgotada', () => {
    expect(evaluateQaPreflight({ ...eligible, quota: { creativesRemaining: 0, creativesLimit: 8 } })).toEqual({
      ok: false,
      code: 'IMAGE_QUOTA_EXHAUSTED',
      message: 'A conta QA não possui cota de imagem suficiente.',
    });
  });

  it('trata respostas ausentes ou inválidas como estado desconhecido', () => {
    expect(evaluateQaPreflight({ ...eligible, subscription: undefined })).toMatchObject({
      ok: false,
      code: 'PREFLIGHT_UNKNOWN',
    });
    expect(evaluateQaPreflight({ ...eligible, quota: undefined })).toMatchObject({
      ok: false,
      code: 'PREFLIGHT_UNKNOWN',
    });
  });

  it('aceita cota ilimitada quando a API informa explicitamente null', () => {
    expect(evaluateQaPreflight({ ...eligible, quota: { creativesRemaining: null, creativesLimit: null } })).toEqual({ ok: true });
  });
});
