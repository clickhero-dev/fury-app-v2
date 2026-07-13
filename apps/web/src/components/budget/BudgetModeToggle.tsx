import { Button } from '../ui/button';

interface BudgetModeToggleProps {
  mode: 'suggestion' | 'auto';
  onChange: (mode: 'suggestion' | 'auto') => void;
  isLoading?: boolean;
}

export function BudgetModeToggle({ mode, onChange, isLoading = false }: BudgetModeToggleProps) {
  return (
    <div className="inline-flex gap-1 p-1 bg-surface-secondary rounded-lg">
      <Button
        variant={mode === 'suggestion' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onChange('suggestion')}
        disabled={isLoading}
        className={mode === 'suggestion' ? 'bg-surface shadow-sm' : ''}
      >
        Sugestão
      </Button>
      <Button
        variant={mode === 'auto' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onChange('auto')}
        disabled={isLoading}
        className={mode === 'auto' ? 'bg-surface shadow-sm' : ''}
      >
        Auto
      </Button>
    </div>
  );
}
