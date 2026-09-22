import { Check, ChevronDown } from 'lucide-react';
import { Select } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface StudioModelOption {
  id: string;
  label: string;
  /** Característica curta do modelo (1-4 palavras), ex.: "Mais rápido". */
  description: string;
  family: 'flux-2' | 'outras' | 'video';
  type: 'image' | 'video';
}

const FALLBACK_MODELS: Array<{ id: string; description: string }> = [
  { id: 'black-forest-labs/flux.2-klein-4b', description: 'Mais rápido' },
  { id: 'black-forest-labs/flux.2-max', description: 'Qualidade' },
  { id: 'black-forest-labs/flux.2-pro', description: 'Alta fidelidade' },
];

/**
 * Seletor compacto de modelo (select nativo estilizado, agrupado por família).
 * Substitui a lista vertical longa: 1 controle, teclado nativo, acessível
 * (label ligado por htmlFor, optgroups "Família FLUX 2" / "Outras famílias").
 * Enquanto o catálogo não carrega, mostra o fallback de 3 modelos FLUX 2.
 */
export function ModelSelect({
  models,
  selectedModel,
  onSelect,
  typeLabel = 'imagem',
  id = 'studio-model-select',
  compact = false,
}: {
  models: StudioModelOption[];
  selectedModel: string;
  onSelect: (id: string) => void;
  typeLabel?: string;
  id?: string;
  /** Pill compacta sem label/descrição — usado inline junto de outros controles (ex.: Criação Rápida). */
  compact?: boolean;
}) {
  const fluxModels = models.filter((m) => m.family === 'flux-2');
  const otherModels = models.filter((m) => m.family !== 'flux-2');
  const selected = models.find((m) => m.id === selectedModel);
  const otherLabel = fluxModels.length > 0 ? 'Outras famílias' : 'Modelos de vídeo';

  const options = (
    <>
      {models.length === 0 ? (
        // Fallback enquanto o catálogo carrega (sempre selecionável)
        FALLBACK_MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.description}</option>
        ))
      ) : (
        <>
          {fluxModels.length > 0 && (
            <optgroup label="Família FLUX 2">
              {fluxModels.map((m) => (
                <option key={m.id} value={m.id}>{m.description}</option>
              ))}
            </optgroup>
          )}
          {otherModels.length > 0 && (
            <optgroup label={otherLabel}>
              {otherModels.map((m) => (
                <option key={m.id} value={m.id}>{m.description}</option>
              ))}
            </optgroup>
          )}
        </>
      )}
    </>
  );

  if (compact) {
    const items = (modelList: StudioModelOption[]) =>
      modelList.map((m) => (
        <DropdownMenuItem
          key={m.id}
          onSelect={() => onSelect(m.id)}
          className="flex items-center justify-between gap-3"
        >
          <span className="truncate">{m.description}</span>
          {m.id === selectedModel && <Check className="h-3.5 w-3.5 shrink-0 text-brand" />}
        </DropdownMenuItem>
      ));

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            id={id}
            data-testid={id}
            aria-label={`Modelo de ${typeLabel}`}
            className="flex w-auto max-w-[220px] items-center gap-2 rounded-full border border-border bg-surface-muted py-2 pl-4 pr-3 text-xs font-semibold text-text-primary transition hover:border-brand/40"
          >
            <span className="truncate">{selected ? selected.description : 'Selecione um modelo'}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
          {models.length === 0 ? (
            FALLBACK_MODELS.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => onSelect(m.id)}>
                {m.description}
              </DropdownMenuItem>
            ))
          ) : (
            <>
              {fluxModels.length > 0 && (
                <>
                  <DropdownMenuLabel>Família FLUX 2</DropdownMenuLabel>
                  {items(fluxModels)}
                </>
              )}
              {otherModels.length > 0 && (
                <>
                  {fluxModels.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{otherLabel}</DropdownMenuLabel>
                  {items(otherModels)}
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-[0.14em] text-text-tertiary">
        Modelo de {typeLabel}
      </label>
      <Select
        id={id}
        value={selectedModel}
        onChange={(e) => onSelect(e.target.value)}
        data-testid={id}
      >
        {options}
      </Select>
    </div>
  );
}