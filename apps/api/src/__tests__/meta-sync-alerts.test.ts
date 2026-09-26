// =============================================================================
// BDD — T006: syncFailureEmailTemplate + integração worker (destinatários + dedupe 6h)
//
/*
# Language: pt-BR

Funcionalidade: Alerta de falha de sincronização Meta por email

  Cenário: template renderiza com identidade ADY
    Dado syncFailureEmailTemplate(tenant, errorCode, message)
    Quando gera o HTML
    Então contém o tenant, o errorCode e a mensagem client-safe
    E não contém token, payload interno nem stack

  Cenário: falha gera email para os 2 destinatários default
    Dado notifyMetaSyncFailure({ tenantId, errorCode, message })
    Quando o alerta é processado
    Então envia 1 email para cada destinatário de SYNC_ALERT_EMAILS (2 no default)

  Cenário: dedupe 6h por (tenant, error_code)
    Dado alerta enviado para (tenant, META_TIMEOUT)
    Quando o MESMO (tenant, META_TIMEOUT) ocorre de novo
    Então NÃO envia outro email (dedupe via Redis NX)

  Cenário: error_code diferente quebra o dedupe
    Dado alerta enviado para (tenant, META_TIMEOUT)
    Quando ocorre (tenant, META_TOKEN_EXPIRED)
    Então envia novo email

  Cenário: sucesso não gera email
    Dado run com status success
    Quando o worker processa
    Então notifyMetaSyncFailure NÃO é chamado
*/
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncFailureEmailTemplate } from '../services/email/email-templates.js';
import { notifyMetaSyncFailure, getSyncAlertEmails } from '../lib/meta-sync-alerts.js';

const ADY_BRAND = '#1E88A8';
const ADY_ACCENT = '#CF6F03';

const { fakeRedis, sendEmail } = vi.hoisted(() => {
  const keys = new Map<string, string>();
  const fakeRedis = {
    set: vi.fn(async (key: string, _v: string, _ex: string, _ttl: number, mode: string) => {
      if (mode === 'NX') {
        if (keys.has(key)) return null;
        keys.set(key, '1');
        return 'OK';
      }
      keys.set(key, '1');
      return 'OK';
    }),
    _keys: keys,
  };
  const sendEmail = vi.fn(async () => {});
  return { fakeRedis, sendEmail };
});

vi.mock('../lib/redis.js', () => ({ getRedis: () => fakeRedis }));
vi.mock('../services/email/email.service.js', () => ({
  emailService: { sendEmail },
}));

describe('BDD: syncFailureEmailTemplate', () => {
  it('Cenário: renderiza com identidade ADY + tenant + errorCode + mensagem client-safe', () => {
    const html = syncFailureEmailTemplate('tenant-1', 'META_TIMEOUT', 'Timeout na conexão com o Meta.');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(ADY_BRAND);
    expect(html).toContain(ADY_ACCENT);
    expect(html).toContain('Gantari');
    expect(html).toContain('tenant-1');
    expect(html).toContain('META_TIMEOUT');
    expect(html).toContain('Timeout na conexão com o Meta.');
    expect(html).not.toContain('access_token');
    expect(html).not.toContain('EAAC');
  });
});

describe('BDD: notifyMetaSyncFailure (integração worker + dedupe)', () => {
  beforeEach(() => {
    fakeRedis._keys.clear();
    vi.clearAllMocks();
  });

  it('Cenário: destinatários default são os 2 emails de alerta', () => {
    const emails = getSyncAlertEmails();
    expect(emails).toContain('diogommtdes@gmail.com');
    expect(emails).toContain('diogo.souza@clickhero.com.br');
  });

  it('Cenário: falha envia email para os 2 destinatários', async () => {
    await notifyMetaSyncFailure({ tenantId: 't1', errorCode: 'META_TIMEOUT', message: 'timeout' });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'diogommtdes@gmail.com' }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'diogo.souza@clickhero.com.br' }));
  });

  it('Cenário: dedupe 6h — mesmo (tenant, error_code) não reenvia', async () => {
    await notifyMetaSyncFailure({ tenantId: 't1', errorCode: 'META_TIMEOUT', message: 'a' });
    expect(sendEmail).toHaveBeenCalledTimes(2);

    vi.clearAllMocks();
    await notifyMetaSyncFailure({ tenantId: 't1', errorCode: 'META_TIMEOUT', message: 'a' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('Cenário: error_code diferente quebra o dedupe', async () => {
    await notifyMetaSyncFailure({ tenantId: 't1', errorCode: 'META_TIMEOUT', message: 'a' });
    vi.clearAllMocks();
    await notifyMetaSyncFailure({ tenantId: 't1', errorCode: 'META_TOKEN_EXPIRED', message: 'b' });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});