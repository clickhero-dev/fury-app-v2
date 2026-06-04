import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    queryClient.clear();
    navigate('/login', { replace: true });
  };
}
