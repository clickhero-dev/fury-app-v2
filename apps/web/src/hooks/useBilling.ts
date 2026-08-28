import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { BillingApiResponse, InvoiceHistoryItem, Plan, SubscribePayload, Subscription } from '../types/billing';

/**
 * Hook para listar os planos disponíveis na plataforma.
 * Cache válido por 5 minutos — planos mudam raramente.
 *
 * @returns Resultado do React Query com array de `Plan`
 *
 * @example
 * const { data: plans } = usePlans();
 */
export function usePlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async (): Promise<Plan[]> => {
      const res = await api.get<BillingApiResponse<Plan[]>>('/billing/plans');
      return res.data.data ?? [];
    },
    staleTime: 5 * 60 * 1000, // Cache válido por 5 minutos
  });
}

/**
 * Hook para buscar a assinatura ativa do tenant autenticado.
 *
 * - Retorna `null` se o tenant não tiver assinatura ativa.
 * - Não tenta novamente em caso de erro (retry: false).
 * - Mantém dados anteriores visíveis durante refetch.
 *
 * @returns Resultado do React Query com `Subscription` ou `null`
 *
 * @example
 * const { data: subscription } = useSubscription();
 * if (!subscription) return <UpgradePrompt />;
 */
export function useSubscription() {
  return useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: async (): Promise<Subscription | null> => {
      const res = await api.get<BillingApiResponse<Subscription | null>>('/billing/subscription');
      return res.data.data;
    },
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/**
 * Hook para listar o histórico de faturas do tenant.
 * Cache válido por 5 minutos.
 *
 * @returns Resultado do React Query com array de `InvoiceHistoryItem`
 *
 * @example
 * const { data: invoices } = useInvoices();
 */
export function useInvoices() {
  return useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: async (): Promise<InvoiceHistoryItem[]> => {
      const res = await api.get<BillingApiResponse<InvoiceHistoryItem[]>>('/billing/invoices');
      return res.data.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para assinar um plano da plataforma.
 * Invalida o cache da assinatura após sucesso.
 * A resposta pode incluir um `paymentLink` para redirecionamento ao Asaas.
 *
 * @returns Mutation do React Query para criação de assinatura
 *
 * @example
 * const { mutate: subscribe } = useSubscribe();
 * subscribe({ planId: 'uuid' }, { onSuccess: (data) => window.open(data.paymentLink) });
 */
export function useSubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SubscribePayload) => {
      const res = await api.post<BillingApiResponse<Subscription & { paymentLink?: string }>>(
        '/billing/subscribe',
        payload
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
    },
  });
}

/**
 * Hook para cancelar a assinatura ativa do tenant.
 * Invalida o cache da assinatura após sucesso.
 *
 * @returns Mutation do React Query para cancelamento de assinatura
 *
 * @example
 * const { mutate: cancelSubscription } = useCancelSubscription();
 * cancelSubscription();
 */
export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/billing/subscription');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
    },
  });
}