import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Inicialização da imagem da API', () => {
  it('Cenário: o processo da API inicia antes das migrations para disponibilizar o health', () => {
    const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
    expect(dockerfile).toMatch(/CMD \["node", "apps\/api\/dist\/index\.js"\]/);
    expect(dockerfile).not.toMatch(/CMD .*dist\/migrate\.js/);
  });
});
