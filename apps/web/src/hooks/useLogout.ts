import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAppDispatch } from '../store/hooks';
import { logout as logoutAction } from '../store/slices/authSlice';

export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  return () => {
    dispatch(logoutAction());

    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');

    queryClient.clear();

    navigate('/login', { replace: true });
  };
}