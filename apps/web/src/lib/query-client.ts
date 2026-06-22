import { QueryClient } from '@tanstack/react-query';

/**
 * Instância singleton do React Query Client compartilhada por toda a aplicação.
 *
 * Configurações padrão:
 * - `staleTime: 30s` — dados são considerados frescos por 30 segundos,
 *   evitando refetches desnecessários em navegações rápidas.
 * - `retry: 2` — tenta novamente até 2 vezes em caso de erro antes de falhar.
 *
 * Importado em dois lugares principais:
 * - `main.tsx` — passado ao `QueryClientProvider` que envolve a aplicação.
 * - `lib/api.ts` — usado no `forceLogout` para limpar o cache ao deslogar.
 *
 * @example
 * // main.tsx
 * import { queryClient } from './lib/query-client';
 * <QueryClientProvider client={queryClient}>
 *   <App />
 * </QueryClientProvider>
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 segundos
      retry: 2,
    },
  },
});