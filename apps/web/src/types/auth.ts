export interface User {
  id: string;
  name: string;
  email: string;
  company: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  company: string;
}

export interface RegisterResponse {
  user: User;
}
