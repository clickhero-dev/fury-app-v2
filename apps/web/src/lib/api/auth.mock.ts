import type { VerifyEmailRequest, VerifyEmailResponse, ForgotPasswordRequest, ForgotPasswordResponse, ResetPasswordRequest, ResetPasswordResponse, User } from '@/types/auth';

/**
 * Mock da API de verificação de email via OTP.
 *
 * Este arquivo implementa mocks temporários enquanto o backend não implementa
 * os endpoints reais. Quando a API estiver pronta, substitua as chamadas
 * aqui por `api.post('/auth/verify-email', ...)` e `api.post('/auth/resend-otp', ...)`.
 */

function generateMockUser(userId: string): User {
  return {
    id: userId,
    name: 'Usuário FURY',
    email: 'user@fury.test',
    role: 'admin',
    tenantId: `tenant_${userId}`,
  };
}

function generateMockTokens() {
  return {
    token: 'mock_access_token_' + Math.random().toString(36).substring(2, 15),
    refreshToken: 'mock_refresh_token_' + Math.random().toString(36).substring(2, 15),
  };
}

/**
 * Mock do endpoint POST /auth/verify-email.
 * Simula latência de rede (~1000ms).
 *
 * Comportamento:
 * - Se código = "000000", retorna erro "Código inválido"
 * - Caso contrário, retorna tokens e dados do usuário
 *
 * TODO: Substituir por chamada real via api.post('/auth/verify-email', ...) quando
 * o backend implementar este endpoint.
 */
export async function mockVerifyEmail(data: VerifyEmailRequest): Promise<VerifyEmailResponse> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (data.code === '000000') {
        reject(new Error('Código inválido'));
      } else {
        resolve({
          ...generateMockTokens(),
          user: generateMockUser(data.userId),
        });
      }
    }, 1000);
  });
}

/**
 * Mock do endpoint POST /auth/resend-otp.
 * Simula latência de rede (~500ms).
 *
 * TODO: Substituir por chamada real via api.post('/auth/resend-otp', ...) quando
 * o backend implementar este endpoint.
 */
export async function mockResendOtp(userId: string): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true });
    }, 500);
  });
}

/**
 * Mock do endpoint POST /auth/forgot-password.
 * Simula latência de rede (~1000ms).
 *
 * Comportamento:
 * - Sempre retorna sucesso, independente do email (prática comum de segurança
 *   para não revelar quais e-mails estão cadastrados no sistema)
 *
 * TODO: Substituir por chamada real via api.post('/auth/forgot-password', ...) quando
 * o backend implementar este endpoint.
 */
export async function mockForgotPassword(data: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true });
    }, 1000);
  });
}

/**
 * Mock do endpoint POST /auth/reset-password.
 * Simula latência de rede (~1000ms).
 *
 * Comportamento:
 * - Se código = "000000", retorna erro "Código inválido"
 * - Caso contrário, retorna sucesso
 *
 * TODO: Substituir por chamada real via api.post('/auth/reset-password', ...) quando
 * o backend implementar este endpoint.
 */
export async function mockResetPassword(data: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (data.otp === '000000') {
        reject(new Error('Código inválido'));
      } else {
        resolve({ success: true });
      }
    }, 1000);
  });
}
