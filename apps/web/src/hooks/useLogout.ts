import { useNavigate } from 'react-router-dom';
import { clearSession } from '../lib/clear-session';

export function useLogout(to = '/login') {
  const navigate = useNavigate();

  return () => {
    clearSession();
    navigate(to, { replace: true });
  };
}