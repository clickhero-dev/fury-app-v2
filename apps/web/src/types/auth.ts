/** Dados do usuário autenticado retornados pela API. */
export interface User {
  id: string;
  name: string | null;
  email: string;
  company?: string;
  tenantName?: string;
  tenantId?: string;
  role?: string;
}

/** Payload enviado no corpo da requisição de login. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Resposta da API após login bem-sucedido. */
export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: User;
}

/** Payload enviado no corpo da requisição de cadastro. */
export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  companyName: string;
}

/** Resposta da API após cadastro bem-sucedido. */
export interface RegisterResponse {
  user: User;
}

/** Payload enviado para verificação de email via OTP. */
export interface VerifyEmailRequest {
  userId: string;
  code: string;
}

/** Resposta da API após verificação de email bem-sucedida. */
export interface VerifyEmailResponse {
  token: string;
  refreshToken: string;
  user: User;
}

/** Payload enviado para solicitação de recuperação de senha. */
export interface ForgotPasswordRequest {
  email: string;
}

/** Resposta da API após solicitação de recuperação de senha. */
export interface ForgotPasswordResponse {
  success: boolean;
}

/** Payload enviado para redefinição de senha via OTP. */
export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

/** Resposta da API após redefinição de senha bem-sucedida. */
export interface ResetPasswordResponse {
  success: boolean;
}