// =============================================================================
// Testes node (sem DOM) — helpers puros do publish-now no front (T008).
// Máquina de estados das mensagens de resultado + label do status publishing.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  publishNowToast,
  publishNowResultMessage,
  PUBLISHING_LABEL,
} from './plannerPage.utils';

describe('publishNowToast (toasts por desfecho do publish-now)', () => {
  it('Cenário: 201 published → sucesso', () => {
    expect(publishNowToast({ data: { status: 'published' } })).toBe('Post publicado com sucesso!');
  });

  it('Cenário: 201 failed por sem Instagram → orienta conectar', () => {
    const res = { data: { status: 'failed', lastPublishError: 'no_instagram_account: ...' } };
    expect(publishNowToast(res)).toContain('Conecte o Instagram');
  });

  it('Cenário: 201 failed por erro da Graph API → mostra o erro real (sem mentir)', () => {
    const res = { data: { status: 'failed', lastPublishError: 'Graph API: token inválido' } };
    expect(publishNowToast(res)).toContain('Graph API: token inválido');
  });

  it('Cenário: 409 POST_CLAIMED → informa que não pode republicar agora', () => {
    const res = { error: { code: 'POST_CLAIMED' } };
    expect(publishNowToast(res)).toContain('em andamento ou já publicado');
  });

  it('Cenário: erro de request (sem shape conhecido) → fallback genérico', () => {
    expect(publishNowToast(null)).toContain('não foi possível publicar');
  });
});

describe('publishNowResultMessage (textos do retry — "Tentar novamente")', () => {
  it('Cenário: retry publicado → sucesso com @', () => {
    expect(publishNowResultMessage({ status: 'published', instagramUsername: 'velora' }))
      .toBe('Post publicado com sucesso! @velora');
  });

  it('Cenário: retry falhou → mensagem menciona tentar novamente', () => {
    const msg = publishNowResultMessage({ status: 'failed', lastPublishError: 'Graph API: boom' });
    expect(msg).toContain('Graph API: boom');
    expect(msg.toLowerCase()).toContain('tente novamente');
  });
});

describe('PUBLISHING_LABEL', () => {
  it('Cenário: label do status publishing → "Publicando…"', () => {
    expect(PUBLISHING_LABEL).toBe('Publicando…');
  });
});
