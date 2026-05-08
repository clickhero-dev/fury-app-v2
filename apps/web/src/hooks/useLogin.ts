import { useMutation } from '@tanstack/react-query';
import type { LoginRequest, LoginResponse } from '../types/auth';
import api from '../lib/api';
import { authMock } from '../lib/auth-mock';

export function useLogin() {
  return useMutation({
    mutationFn: async (data: LoginRequest): Promise<LoginResponse> => {
      try {
        const response = await api.post<LoginResponse>('/auth/login', data);
        return response.data;
      } catch (error) {
        console.warn('API login failed, using mock:', error);
        return authMock.login(data.email, data.password);
      }
    },
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    },
  });
}
