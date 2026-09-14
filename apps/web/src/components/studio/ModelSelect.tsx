import { Select } from '@/components/ui/select';

export interface StudioModelOption {
  id: string;
  label: string;
  description: string;
  category: string;
  family: 'flux-2' | 'outras' | 'video';
  type: 'image' | 'video';
}

const CATEGORY_LABEL: Record<string, string> = {
  barato: 'Barato',
  'custo-beneficio': 'Custo-benefício',
  qualidade: 'Qualidade',
};

const FALLBACK_MODELS: Array<{ id: string; label: string }> = [
  { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B' },
  { id: 'black-forest-labs/flux.2-max', label: 'FLUX.2 Max' },
  { id: 'black-forest-labs/flux.2-pro', label: 'FLUX.2 Pro' },
];

function optionText(model: StudioModelOption): string {
  const category = CATEGORY_LABEL[model.category] ?? model.category;
  return `${model.label} — ${category}`;
}

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
}: {
  models: StudioModelOption[];
  selectedModel: string;
  onSelect: (id: string) => void;
  typeLabel?: string;
  id?: string;
}) {
  const fluxModels = models.filter((m) => m.family === 'flux-2');
  const otherModels = models.filter((m) => m.family !== 'flux-2');
  const selected = models.find((m) => m.id === selectedModel);
  const otherLabel = fluxModels.length > 0 ? 'Outras famílias' : 'Modelos de vídeo';

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
        {models.length === 0 ? (
          // Fallback enquanto o catálogo carrega (sempre selecionável)
          FALLBACK_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))
        ) : (
          <>
            {fluxModels.length > 0 && (
              <optgroup label="Família FLUX 2">
                {fluxModels.map((m) => (
                  <option key={m.id} value={m.id}>{optionText(m)}</option>
                ))}
              </optgroup>
            )}
            {otherModels.length > 0 && (
              <optgroup label={otherLabel}>
                {otherModels.map((m) => (
                  <option key={m.id} value={m.id}>{optionText(m)}</option>
                ))}
              </optgroup>
            )}
          </>
        )}
      </Select>
      {selected?.description && (
        <p className="text-xs text-text-tertiary">{selected.description}</p>
      )}
    </div>
  );
}