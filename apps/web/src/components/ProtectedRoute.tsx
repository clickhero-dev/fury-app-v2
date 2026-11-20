import { Navigate, useLocation } from 'react-router-dom';
import { rememberLoginDestination } from '../pages/auth/initialDestination';
import { useAppSelector } from '../store/hooks';
import { selectIsAuthenticated } from '../store/slices/authSlice';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    rememberLoginDestination(location.pathname + location.search + location.hash);
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
