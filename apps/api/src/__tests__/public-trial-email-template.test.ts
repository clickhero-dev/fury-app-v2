/**
 * Funcionalidade: acesso do Trial por email
 * Cenário: dados externos são escapados e o link de acesso aponta ao destino seguro.
 */
import { describe, expect, it } from 'vitest';
import { trialAccessEmailTemplate } from '../services/email/email-templates.js';

describe('trialAccessEmailTemplate', () => {
  it('Dado nome e URL do link, quando renderiza o email, então escapa o nome e inclui o CTA', () => {
    const html = trialAccessEmailTemplate('Ana <script>', 'https://app.example/trial/acesso#token=abc');
    expect(html).toContain('Ana &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="https://app.example/trial/acesso#token=abc"');
    expect(html).toContain('15 minutos');
  });
});
