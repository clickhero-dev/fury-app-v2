/* # language: pt-BR
Funcionalidade: voltar ao destino solicitado após autenticação
  Cenário: caminho padrão do produto é a Home, independentemente do plano
  Cenário: superadmin preserva sua área separada
  Cenário: deep links internos preservam busca e fragmento
  Cenário: URLs externas e rotas de login são descartadas
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialDestination, rememberLoginDestination, consumeLoginDestination } from './initialDestination';
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => vi.restoreAllMocks());
describe('destino após login', () => {
  it('usa Home por padrão e mantém a área superadmin separada', () => {
    expect(initialDestination()).toBe('/inicio');
    localStorage.setItem('user', JSON.stringify({platformRole:'super_admin'}));
    expect(initialDestination()).toBe('/admin/dashboard');
    localStorage.setItem('user', 'inválido');
    expect(initialDestination()).toBe('/inicio');
  });
  it('consome deep link legítimo uma vez e mantém query/hash', () => {
    rememberLoginDestination('/calendario?view=week#hoje');
    expect(consumeLoginDestination()).toBe('/calendario?view=week#hoje');
    expect(consumeLoginDestination()).toBe('/inicio');
  });
  it.each(['https://externo.invalid', '//externo.invalid', '/\\externo.invalid', '/login', '/trial/acesso', '/inexistente', '/inicio\nLocation: externo'])('descarta destino inválido %s', value => {
    rememberLoginDestination(value);
    expect(consumeLoginDestination()).toBe('/inicio');
  });
  it('valida também dados antigos ou adulterados na aba', () => {
    sessionStorage.setItem('ady-login-destination', '//externo.invalid');
    expect(consumeLoginDestination()).toBe('/inicio');
  });
  it('continua com o padrão quando o armazenamento está indisponível', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => rememberLoginDestination('/chat')).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(consumeLoginDestination()).toBe('/inicio');
  });
});
