import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('configuração de build do WebSocket de chat', () => {
  it('disponibiliza a URL pública ao build do Vite', () => {
    const dockerfile = readFileSync(new URL('../../../Dockerfile', import.meta.url), 'utf8');
    expect(dockerfile).toMatch(/ARG VITE_CHAT_WS_URL/);
    expect(dockerfile).toMatch(/ENV VITE_CHAT_WS_URL=\$VITE_CHAT_WS_URL/);
  });
});
