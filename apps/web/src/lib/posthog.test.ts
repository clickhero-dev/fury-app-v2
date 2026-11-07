/*
 * Funcionalidade: URLs e gravações de sessão do acesso por magic link não expõem o token.
 * Cenários:
 * - Dado pageview do acesso Trial com token no fragmento, quando é enviado, então o fragmento é removido das URLs registradas.
 * - Dado evento fora da página de acesso Trial, quando é enviado, então suas URLs não são alteradas.
 * - Dado URL inicial do magic link, quando decide sobre gravação de sessão, então mantém replay pausado até remover o token.
 */
import { describe, expect, it } from 'vitest';
import { hasTrialAccessTokenInLocation, sanitizeTrialAccessEvent } from './posthog.js';

describe('sanitizeTrialAccessEvent', () => {
  it('Dado pageview do acesso Trial com token no fragmento, quando é enviado, então remove o fragmento das URLs', () => {
    const tokenUrl = 'https://app.example.invalid/trial/acesso#token=secret-token';
    const event = {
      event: '$pageview',
      properties: { $current_url: tokenUrl, $url: tokenUrl, feature: 'trial' },
    };

    expect(sanitizeTrialAccessEvent(event)).toEqual({
      event: '$pageview',
      properties: {
        $current_url: 'https://app.example.invalid/trial/acesso',
        $url: 'https://app.example.invalid/trial/acesso',
        feature: 'trial',
      },
    });
  });

  it('Dado evento fora da página de acesso Trial, quando é enviado, então preserva as URLs', () => {
    const event = { event: '$pageview', properties: { $current_url: 'https://app.example.invalid/estudio#secao' } };
    expect(sanitizeTrialAccessEvent(event)).toEqual(event);
  });

  it('Dado URL inicial do magic link, quando decide sobre gravação de sessão, então detecta o token até removê-lo', () => {
    expect(hasTrialAccessTokenInLocation('/trial/acesso', '#token=secret-token')).toBe(true);
    expect(hasTrialAccessTokenInLocation('/trial/acesso', '')).toBe(false);
    expect(hasTrialAccessTokenInLocation('/estudio', '#token=secret-token')).toBe(false);
  });
});
