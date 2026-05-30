import { useMutation } from '@tanstack/react-query';
import type { RegisterRequest, RegisterResponse } from '../types/auth';
import api from '../lib/api';

export function useRegister() {
  return useMutation({
    mutationFn: async (data: RegisterRequest): Promise<RegisterResponse> => {
      const response = await api.post<{ success: boolean; data: RegisterResponse; timestamp: string }>('/auth/register', data);
      return response.data.data as RegisterResponse;
    },
  });
}
