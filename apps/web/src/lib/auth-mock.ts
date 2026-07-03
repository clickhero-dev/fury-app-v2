import type { LoginResponse, RegisterResponse, User } from '../types/auth';

/**
 * Usuário fictício usado nas respostas do mock de autenticação.
 * Corresponde às credenciais de demonstração definidas em `utils.ts`.
 */
const mockUser: User = {
  id: '1',
  name: 'Test User',
  email: 'dev.fashion@fury.test',
  company: 'Test Company',
};

/**
 * Mock do serviço de autenticação para desenvolvimento local.
 *
 * Simula as respostas da API de auth sem depender do backend.
 * Usado quando `META_USE_MOCK=true` ou quando a API não está disponível.
 *
 * Comportamento:
 * - `login`: aceita apenas o email de demo (`dev.fashion@fury.test`),
 *   retorna token fake com timestamp para simular unicidade.
 * - `register`: aceita qualquer dado e retorna um usuário criado com ID baseado em timestamp.
 */
export const authMock = {
  /**
   * Simula o login de um usuário.
   * Aceita apenas o email de demonstração — lança erro para qualquer outro.
   *
   * @param email - Email do usuário
   * @param _password - Senha (ignorada no mock)
   * @returns Resposta de login com token fake e dados do usuário mock
   * @throws Error se o email não for o de demonstração
   */
  login: async (email: string, _password: string): Promise<LoginResponse> => {
    if (email === 'dev.fashion@fury.test') {
      return {
        token: `mock-token-${Date.now()}`,
        refreshToken: 'mock-refresh-token',
        user: mockUser,
      };
    }
    throw new Error('Invalid credentials');
  },

  /**
   * Simula o cadastro de um novo usuário.
   * Aceita qualquer dado e retorna um usuário com ID baseado no timestamp atual.
   *
   * @param name - Nome do usuário
   * @param email - Email do usuário
   * @param _password - Senha (ignorada no mock)
   * @param company - Nome da empresa
   * @returns Resposta de cadastro com dados do usuário criado
   */
  register: async (
    name: string,
    email: string,
    _password: string,
    company: string
  ): Promise<RegisterResponse> => {
    return {
      user: {
        id: String(Date.now()),
        name,
        email,
        company,
      },
    };
  },
};