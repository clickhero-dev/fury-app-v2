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