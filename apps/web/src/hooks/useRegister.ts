import { useMutation } from '@tanstack/react-query';
import type { RegisterRequest, RegisterResponse } from '../types/auth';
import api from '../lib/api';
import { authMock } from '../lib/auth-mock';

export function useRegister() {
  return useMutation({
    mutationFn: async (data: RegisterRequest): Promise<RegisterResponse> => {
      try {
        const response = await api.post<RegisterResponse>('/auth/register', data);
        return response.data;
      } catch (error) {
        console.warn('API register failed, using mock:', error);
        return authMock.register(data.name, data.email, data.password, data.company);
      }
    },
  });
}
