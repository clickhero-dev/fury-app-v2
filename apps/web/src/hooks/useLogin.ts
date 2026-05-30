import { useMutation } from '@tanstack/react-query';
import type { LoginRequest, LoginResponse } from '../types/auth';
import api from '../lib/api';

export function useLogin() {
  return useMutation({
    mutationFn: async (data: LoginRequest): Promise<LoginResponse> => {
      const response = await api.post<{ success: boolean; data: LoginResponse; timestamp: string }>('/auth/login', data);
      return response.data.data;
    },
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    },
  });
}
