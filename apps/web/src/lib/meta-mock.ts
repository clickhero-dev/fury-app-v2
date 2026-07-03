import type { MetaAuthResponse } from '../types/meta';

/**
 * Mock do serviço de integração com a Meta Ads API.
 *
 * Usado quando `META_USE_MOCK=true` está configurado no ambiente,
 * permitindo desenvolvimento e testes sem credenciais Meta reais.
 */
export const metaMock = {
  /**
   * Simula a geração da URL de autorização OAuth do Meta.
   * Retorna uma URL fake que não redireciona para o Facebook real.
   *
   * @returns URL de autenticação fictícia
   */
  getAuthUrl: async (): Promise<MetaAuthResponse> => {
    return {
      url: 'https://facebook.com/mock-oauth',
    };
  },
};