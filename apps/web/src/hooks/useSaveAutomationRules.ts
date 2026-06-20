import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Configuração das regras de automação simplificadas do tenant.
 * Define quais condições automáticas devem pausar campanhas com baixo desempenho.
 */
export interface AutomationRules {
  /** Ativa a regra de pausa por CPA alto. */
  pauseHighCpa: boolean;
  /** Valor de CPA (em reais) acima do qual a campanha é pausada automaticamente. */
  pauseHighCpaThreshold: number;
  /** Ativa a regra de pausa por ROAS baixo. */
  pauseLowRoas: boolean;
  /** Valor de ROAS abaixo do qual a campanha é pausada automaticamente. */
  pauseLowRoasThreshold: number;
  /** Ativa a regra de pausa por ausência de conversões. */
  pauseNoConversions: boolean;
  /** Valor gasto (em reais) sem nenhuma conversão que dispara a pausa automática. */
  pauseNoConversionsSpending: number;
}

/**
 * Hook para salvar as regras de automação do tenant.
 *
 * Envia as configurações para `POST /automation/rules`.
 * Em caso de erro, relança a exceção para que o componente chamador possa tratá-la.
 *
 * @returns Mutation do React Query para salvar as regras
 *
 * @example
 * const { mutate: saveRules, isPending } = useSaveAutomationRules();
 *
 * saveRules({
 *   pauseHighCpa: true,
 *   pauseHighCpaThreshold: 80,
 *   pauseLowRoas: false,
 *   pauseLowRoasThreshold: 2,
 *   pauseNoConversions: true,
 *   pauseNoConversionsSpending: 200,
 * });
 */
export function useSaveAutomationRules() {
  return useMutation({
    mutationFn: async (rules: AutomationRules) => {
      try {
        const response = await api.post('/automation/rules', rules);
        return response.data;
      } catch (error) {
        console.warn('Failed to save automation rules:', error);
        throw error;
      }
    },
  });
}