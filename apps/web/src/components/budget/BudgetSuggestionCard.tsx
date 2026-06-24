import { ArrowDown, ArrowUp } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import type { BudgetSuggestion } from '@/types/budget.types';

interface BudgetSuggestionCardProps {
  suggestion: BudgetSuggestion;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  isApplying?: boolean;
  isRejecting?: boolean;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export function BudgetSuggestionCard({
  suggestion,
  onApply,
  onReject,
  isApplying = false,
  isRejecting = false,
}: BudgetSuggestionCardProps) {
  const isPositive = suggestion.change_pct > 0;
  const isPending = suggestion.status === 'pending';

  const changeColor = isPositive ? 'text-success' : 'text-error';
  const ArrowIcon = isPositive ? ArrowUp : ArrowDown;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        {/* Header: Campaign name + Status Badge */}
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold text-gray-900">{suggestion.campaignName}</h3>
          {!isPending && (
            <Badge variant={suggestion.status === 'applied' ? 'success' : 'error'}>
              {suggestion.status === 'applied' ? 'Aplicada' : 'Rejeitada'}
            </Badge>
          )}
        </div>

        {/* Budget comparison */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-600">Orçamento Atual</p>
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(suggestion.currentBudget)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Orçamento Sugerido</p>
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(suggestion.suggestedBudget)}</p>
          </div>
        </div>

        {/* Change percentage with icon */}
        <div className={`flex items-center gap-1 ${changeColor}`}>
          <ArrowIcon size={16} />
          <span className="text-sm font-semibold">{Math.abs(suggestion.change_pct).toFixed(1)}%</span>
        </div>

        {/* Reason */}
        <div>
          <p className="text-xs text-gray-600">Motivo</p>
          <p className="text-sm text-gray-700">{suggestion.reason}</p>
        </div>

        {/* Buttons or Status Badge */}
        {isPending ? (
          <div className="flex gap-2 pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => onApply(suggestion.id)}
              disabled={isApplying || isRejecting}
              className="flex-1"
            >
              {isApplying ? 'Aplicando...' : 'Aplicar'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReject(suggestion.id)}
              disabled={isApplying || isRejecting}
              className="flex-1"
            >
              {isRejecting ? 'Rejeitando...' : 'Rejeitar'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
