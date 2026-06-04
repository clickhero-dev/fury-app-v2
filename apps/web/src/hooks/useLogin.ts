import { useMutation } from '@tanstack/react-query';
import type { LoginRequest, LoginResponse } from '../types/auth';
import api from '../lib/api';

export function useLogin() {
  return useMutation({
    mutationFn: async (data: LoginRequest): Promise<LoginResponse> => {
      const response = await api.post<{ success: boolean; data: LoginResponse; timestamp: string }>('/auth/login', data);
      const result = response.data.data;
      localStorage.setItem('token', result.token);
      localStorage.setItem('refreshToken', result.refreshToken);
      localStorage.setItem('user', JSON.stringify(result.user));
      return result;
    },
  });
}
