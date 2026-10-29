import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlatformLogo } from './PlatformLogo';

export type CampaignPlatform = 'meta' | 'google';

interface CampaignPlatformSelectorProps {
  value: CampaignPlatform | null;
  onChange: (platform: CampaignPlatform) => void;
}

const OPTIONS: Array<{
  value: CampaignPlatform;
  title: string;
  description: string;
}> = [
  {
    value: 'meta',
    title: 'Meta',
    description: 'Facebook e Instagram',
  },
  {
    value: 'google',
    title: 'Google',
    description: 'Performance Max, Google Ads e Perfil da Empresa',
  },
];

export function CampaignPlatformSelector({ value, onChange }: CampaignPlatformSelectorProps) {
  return (
    <div className="space-y-4" aria-labelledby="campaign-platform-title">
      <div>
        <h2 id="campaign-platform-title" className="text-lg font-bold text-text-primary">
          Onde você deseja anunciar?
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Escolha a plataforma para continuar a criação da campanha.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex min-h-32 items-start gap-4 rounded-xl border-2 p-5 text-left transition-all',
                selected
                  ? 'border-brand bg-brand/10'
                  : 'border-border bg-surface hover:border-brand/40'
              )}
            >
              <PlatformLogo platform={option.value} />
              <span className="flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold text-text-primary">{option.title}</span>
                  {selected && <Check className="h-5 w-5 text-brand" aria-label="Selecionado" />}
                </span>
                <span className="mt-1 block text-sm text-text-secondary">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
