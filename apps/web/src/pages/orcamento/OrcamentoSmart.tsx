import { useState } from 'react';
import { AppLayout, PageHeader, LoadingSpinner, EmptyState } from '@/components';
import { BudgetSuggestionCard } from '@/components/budget/BudgetSuggestionCard';
import { BudgetModeToggle } from '@/components/budget/BudgetModeToggle';
import { useBudgetConfig } from '@/hooks/useBudgetConfig';
import { useBudgetSuggestions } from '@/hooks/useBudgetSuggestions';
import { useApplyBudgetSuggestion } from '@/hooks/useApplyBudgetSuggestion';
import { useRejectBudgetSuggestion } from '@/hooks/useRejectBudgetSuggestion';
import { useUpdateBudgetConfig } from '@/hooks/useUpdateBudgetConfig';

export function OrcamentoSmart() {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<'apply' | 'reject' | null>(null);

  const { data: config, isLoading: configLoading } = useBudgetConfig();
  const { data: suggestions, isLoading: suggestionsLoading, isError: suggestionsError } = useBudgetSuggestions('pending');
  const applyMutation = useApplyBudgetSuggestion();
  const rejectMutation = useRejectBudgetSuggestion();
  const updateConfigMutation = useUpdateBudgetConfig();

  const handleModeChange = (newMode: 'suggestion' | 'auto') => {
    if (config) {
      updateConfigMutation.mutate(
        { mode: newMode },
        {
          onSuccess: () => {
            // Query will be invalidated automatically
          },
        }
      );
    }
  };

  const handleApply = (id: string) => {
    setProcessingId(id);
    setProcessingAction('apply');
    applyMutation.mutate(id, {
      onSettled: () => {
        setProcessingId(null);
        setProcessingAction(null);
      },
    });
  };

  const handleReject = (id: string) => {
    setProcessingId(id);
    setProcessingAction('reject');
    rejectMutation.mutate(id, {
      onSettled: () => {
        setProcessingId(null);
        setProcessingAction(null);
      },
    });
  };

  const isEmpty = !suggestionsLoading && (!suggestions || suggestions.length === 0);

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Orçamento Smart</h2>
          {configLoading ? <LoadingSpinner size="sm" /> : config ? <BudgetModeToggle mode={config.mode} onChange={handleModeChange} isLoading={updateConfigMutation.isPending} /> : null}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Gerenciamento de Orçamento"
          description="Otimize seu orçamento de campanhas com recomendações inteligentes"
        />

        {/* Main Content */}
        <div className="space-y-4">
          {/* Loading state */}
          {suggestionsLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          )}

          {/* Error state */}
          {suggestionsError && !suggestionsLoading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h3 className="text-base font-semibold text-red-900 mb-2">Erro ao carregar sugestões</h3>
              <p className="text-sm text-red-700">Não foi possível carregar as sugestões de orçamento. Tente novamente mais tarde.</p>
            </div>
          )}

          {/* Empty state */}
          {isEmpty && !suggestionsError && (
            <EmptyState
              title="Nenhuma sugestão disponível"
              description="Não há sugestões de orçamento pendentes no momento. Suas campanhas estão otimizadas!"
            />
          )}

          {/* Suggestions Grid */}
          {!suggestionsLoading && !suggestionsError && suggestions && suggestions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suggestions.map((suggestion) => {
                const isProcessing = processingId === suggestion.id;
                const isApplying = isProcessing && processingAction === 'apply';
                const isRejecting = isProcessing && processingAction === 'reject';

                return (
                  <BudgetSuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onApply={handleApply}
                    onReject={handleReject}
                    isApplying={isApplying}
                    isRejecting={isRejecting}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
