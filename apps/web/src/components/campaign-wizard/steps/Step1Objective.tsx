import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WizardObjective } from '../types';

interface ObjectiveOption {
  value: WizardObjective;
  emoji: string;
  title: string;
  description: string;
}

const OBJECTIVE_OPTIONS: ObjectiveOption[] = [
  {
    value: 'visits',
    emoji: '🚀',
    title: 'Visitas',
    description: 'Leve mais pessoas para o seu site, perfil ou link de destino.',
  },
  {
    value: 'engagement',
    emoji: '💬',
    title: 'Engajamento',
    description: 'Aumente curtidas, comentários e compartilhamentos no seu conteúdo.',
  },
  {
    value: 'messages',
    emoji: '🎯',
    title: 'Atração de Clientes',
    description: 'Receba mensagens diretas de pessoas interessadas no seu produto ou serviço.',
  },
];

interface Step1ObjectiveProps {
  value: WizardObjective | null;
  onChange: (objective: WizardObjective) => void;
}

export function Step1Objective({ value, onChange }: Step1ObjectiveProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Qual o objetivo da sua campanha?</h3>
        <p className="text-sm text-gray-500 mt-1">Escolha o que você mais quer alcançar com este anúncio.</p>
      </div>

      <div className="space-y-3">
        {OBJECTIVE_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-4',
                isSelected
                  ? 'border-[#E8631A] bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-[#E8631A]/40'
              )}
            >
              <div className="text-3xl leading-none">{option.emoji}</div>
              <div className="flex-1">
                <div className="font-bold text-gray-900">{option.title}</div>
                <div className="text-sm text-gray-500 mt-1">{option.description}</div>
              </div>
              <div
                className={cn(
                  'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1',
                  isSelected ? 'border-[#E8631A] bg-[#E8631A]' : 'border-gray-300'
                )}
              >
                {isSelected && <Check className="w-4 h-4 text-white" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
