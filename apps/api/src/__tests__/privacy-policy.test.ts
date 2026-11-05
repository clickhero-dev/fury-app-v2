import { describe, it, expect } from 'vitest';
import { buildPrivacyPolicyBody, renderPrivacyPolicyHtml, privacyPolicyUrl } from '../lib/privacy-policy.js';

describe('privacy-policy (template padrão do anunciante)', () => {
  it('buildPrivacyPolicyBody substitui o placeholder {NOME_DO_TENANT} pelo nome do tenant', () => {
    const body = buildPrivacyPolicyBody('Padaria Estrela');
    expect(body).toContain('# Política de Privacidade — Padaria Estrela');
    expect(body).toContain('A Padaria Estrela valoriza a sua privacidade');
    expect(body).toContain('LGPD');
    expect(body).not.toContain('{NOME_DO_TENANT}');
  });

  it('renderPrivacyPolicyHtml gera HTML com o nome do tenant (escape seguro)', () => {
    const html = renderPrivacyPolicyHtml('Loja <b>Test</b> & Cia');
    expect(html).toContain('<html');
    expect(html).toContain('<title>Política de Privacidade — Loja &lt;b&gt;Test&lt;/b&gt; &amp; Cia</title>');
    expect(html).toContain('<h1>');
    expect(html).toContain('<h2>6. Contato</h2>');
    expect(html).toContain('LGPD');
  });

  it('renderPrivacyPolicyHtml trata nome vazio com fallback', () => {
    const html = renderPrivacyPolicyHtml('   ');
    expect(html).toContain('Nossa empresa');
  });

  it('privacyPolicyUrl monta a URL pública com o slug', () => {
    expect(privacyPolicyUrl('meu-negocio')).toBe('https://app.useady.com.br/privacidade/meu-negocio');
  });
});