import { useAppSelector } from '../store/hooks';
import { selectIsAuthenticated, selectUser, selectToken } from '../store/slices/authSlice';

export function useAuth() {
  const token = useAppSelector(selectToken);
  const user = useAppSelector(selectUser);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  return {
    user: token ? user : null,
    isLoading: false,
    logout: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
  };
}
