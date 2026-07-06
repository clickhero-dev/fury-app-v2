import { useMutation } from '@tanstack/react-query';
import { useAppDispatch } from '../store/hooks';
import { login as loginAction } from '../store/slices/authSlice';
import type { LoginRequest, LoginResponse } from '../types/auth';
import api from '../lib/api';

export function useLogin() {
  const dispatch = useAppDispatch();

  return useMutation({
    mutationFn: async (data: LoginRequest): Promise<LoginResponse> => {
      const response = await api.post<{ success: boolean; data: LoginResponse; timestamp: string }>(
        '/auth/login',
        data
      );
      const result = response.data.data;

      localStorage.setItem('token', result.token);
      localStorage.setItem('refreshToken', result.refreshToken);
      localStorage.setItem('user', JSON.stringify(result.user));

      dispatch(loginAction({
        token: result.token,
        refreshToken: result.refreshToken,
        name: result.user.name ?? null,
        email: result.user.email,
        tenantId: result.user.tenantId ?? '',
      }));

      return result;
    },
  });
}