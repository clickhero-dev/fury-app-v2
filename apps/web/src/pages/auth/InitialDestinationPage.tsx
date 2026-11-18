import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import api from '@/lib/api';
import type { BillingApiResponse, Subscription } from '@/types/billing';
import { initialDestination } from './initialDestination';

/** Consulta própria por sessão evita reutilizar assinatura de outro tenant. */
export function InitialDestinationPage() {
  const token = localStorage.getItem('token');
  const { data, isPending, isError } = useQuery({
    queryKey: ['initial-subscription', token],
    queryFn: async () => (await api.get<BillingApiResponse<Subscription | null>>('/billing/subscription')).data.data,
    enabled: !!token,
    staleTime: 0,
    retry: false,
  });
  if (!token) return <Navigate to="/login" replace />;
  if (isPending) return <main>Preparando seu acesso…</main>;
  const destination = initialDestination(isError ? null : data ?? null);
  return <Navigate to={destination} state={{ initialDestination: destination }} replace />;
}
