import { queryClient } from './query-client';
import { store } from '../store';
import { logout } from '../store/slices/authSlice';

// dados da conta no navegador; nada disso pode passar para o próximo login
const SESSION_KEYS = [
  'token',
  'refreshToken',
  'user',
  'ady-meta-connected',
  'fury-meta-connected',
  'fury_selected_copy',
  'fury_planner_job_id',
];

// Limpa sessão, cache de dados e store (plano/política saem no reducer logout)
export function clearSession() {
  for (const key of SESSION_KEYS) localStorage.removeItem(key);
  queryClient.clear();
  store.dispatch(logout());
}
