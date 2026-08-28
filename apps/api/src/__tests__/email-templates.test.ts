import { describe, it, expect } from 'vitest';
import {
  otpEmailTemplate,
  welcomeEmailTemplate,
  passwordResetConfirmationTemplate,
  accountConnectedEmailTemplate,
  accountDisconnectedEmailTemplate,
  gmbLinkedEmailTemplate,
  gmbUnlinkedEmailTemplate,
  campaignPublishedEmailTemplate,
  gmbProfileVerifiedEmailTemplate,
} from '../services/email/email-templates.js';

const ADY_BRAND = '#1E88A8';
const ADY_ACCENT = '#CF6F03';

describe('email-templates (identidade ADY)', () => {
  const cases: Array<[string, string]> = [
    ['otp', otpEmailTemplate('123456')],
    ['welcome', welcomeEmailTemplate('Diogo')],
    ['reset confirmation', passwordResetConfirmationTemplate()],
    ['meta conectada', accountConnectedEmailTemplate('Meta')],
    ['meta desconectada', accountDisconnectedEmailTemplate('Meta')],
    ['gmb vinculado', gmbLinkedEmailTemplate('Padaria Central')],
    ['gmb desvinculado', gmbUnlinkedEmailTemplate()],
    ['campanha publicada', campaignPublishedEmailTemplate('Festa de Verão')],
    ['gmb verificado', gmbProfileVerifiedEmailTemplate('Padaria Central')],
  ];

  it.each(cases)('%s renderiza documento HTML com identidade ADY', (_name, html) => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain(ADY_BRAND);
    expect(html).toContain(ADY_ACCENT);
    expect(html).toContain('Gantari');
    expect(html).toContain('ady'); // wordmark
  });

  it('otp usa os 6 dígitos separados', () => {
    const html = otpEmailTemplate('123456');
    expect(html).toContain('>1<');
    expect(html).toContain('>6<');
  });

  it('cpnectada/desconectada interpolam a plataforma no título', () => {
    expect(accountConnectedEmailTemplate('Meta')).toContain('Meta está conectada');
    expect(accountDisconnectedEmailTemplate('Meta')).toContain('Meta foi desconectada');
  });

  it('gmb vinculado interpola o nome do negócio', () => {
    expect(gmbLinkedEmailTemplate('Padaria Central')).toContain('Padaria Central');
  });

  it('campanha publicada interpola o nome + checklist', () => {
    const html = campaignPublishedEmailTemplate('Festa de Verão');
    expect(html).toContain('Festa de Verão');
    expect(html).toContain('está no ar');
    expect(html).toContain('Publicada');
  });

  it('templates transacionais têm um CTA (âncora com href) — exceto o OTP (só o código)', () => {
    for (const [name, html] of cases) {
      if (name === 'otp') continue;
      expect(html, name).toMatch(/<a href="https?:/);
    }
  });
});