import { useState } from 'react';
import { Check, Loader2, Upload, X } from 'lucide-react';
import { KIND_META, countByKind, useStudioLibrary, type LibraryFilter, type LibraryPhoto } from '@/hooks/useStudioLibrary';

type Filter = LibraryFilter;

interface FilterChipsProps {
  options: Filter[];
  value: Filter;
  counts: Record<Filter, number>;
  onChange: (f: Filter) => void;
}

/** Filtros por tipo + "Limpar filtro" (painel lateral e "Minhas fotos"). */
export function FilterChips({ options, value, counts, onChange }: FilterChipsProps) {
  return (
    <div className="space-y-1.5">
      {/* todos lado a lado: nome em cima, número embaixo */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((f) => {
          const active = value === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onChange(f)}
              aria-pressed={active}
              className={`ady-btn flex min-w-0 flex-col items-center rounded-xl border px-1 py-1.5 text-xs font-semibold leading-tight transition ${
                active ? 'chip-active border-brand-hover bg-brand-hover text-white shadow-sm' : 'border-border bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="block max-w-full truncate">{f === 'todas' ? 'Todas' : KIND_META[f].plural}</span>{' '}
              <span className="block text-[11px] opacity-75">{counts[f]}</span>
            </button>
          );
        })}
      </div>
      {value !== 'todas' && (
        <button
          type="button"
          onClick={() => onChange('todas')}
          className="ady-btn inline-flex items-center gap-1 px-1 py-0.5 text-xs font-semibold text-brand hover:underline"
        >
          <X className="h-3 w-3" />
          Limpar filtro
        </button>
      )}
    </div>
  );
}

interface TileProps {
  photo: LibraryPhoto;
  selected: boolean;
  /** Número exibido no selo de selecionado (ordem de escolha); sem número mostra um check. */
  order?: number;
  onClick: () => void;
}

/** Miniatura quadrada com etiqueta do tipo. */
export function LibraryTile({ photo, selected, order, onClick }: TileProps) {
  const meta = KIND_META[photo.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${selected ? 'Remover' : 'Usar'} imagem: ${meta.label}`}
      className={`ady-btn relative aspect-square w-full overflow-hidden rounded-lg border-2 bg-surface-secondary transition ${
        selected ? meta.ringClass : 'border-transparent hover:border-border'
      }`}
    >
      <img src={photo.url} alt="" className="h-full w-full object-cover" />
      <span className={`absolute bottom-1 left-1 rounded-full px-1.5 py-px text-[9px] font-bold ${meta.badgeClass}`}>
        {meta.label}
      </span>
      {selected && (
        <span className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${meta.badgeClass}`}>
          {order ?? <Check className="h-3 w-3" />}
        </span>
      )}
    </button>
  );
}

interface Props {
  templateId: string | null;
  artPhotoIds: string[];
  onPickTemplate: (photo: LibraryPhoto) => void;
  onToggleArtPhoto: (photo: LibraryPhoto) => void;
  onUploadClick: () => void;
  uploading?: boolean;
}

/**
 * Painel lateral da Criação Rápida: biblioteca com filtro por tipo. Clicar num
 * modelo define o modelo da criação; num produto/equipe, coloca/tira da arte.
 */
export function ReferenceImagePanel({ templateId, artPhotoIds, onPickTemplate, onToggleArtPhoto, onUploadClick, uploading }: Props) {
  const { data: photos = [], isLoading } = useStudioLibrary();
  const [filter, setFilter] = useState<Filter>('todas');
  const visible = filter === 'todas' ? photos : photos.filter((p) => p.kind === filter);

  return (
    <aside className="ady-decor sticky top-6 flex max-h-[calc(100vh-11rem)] flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-tertiary">Suas imagens</h2>
        <p className="mt-1 text-xs text-text-tertiary">Toque numa imagem para usar nesta criação.</p>
      </div>

      <button
        type="button"
        onClick={onUploadClick}
        disabled={uploading}
        className="ady-btn flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand/10 px-3 py-2.5 text-xs font-semibold text-brand transition hover:bg-brand/20 disabled:cursor-wait disabled:opacity-60"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? 'Enviando...' : 'Enviar imagens'}
      </button>

      <div className="shrink-0">
        <FilterChips options={['todas', 'modelo', 'produto', 'equipe']} value={filter} counts={countByKind(photos)} onChange={setFilter} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
          </div>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-tertiary">
            {photos.length === 0 ? 'Nenhuma imagem ainda. Envie a primeira.' : 'Nenhuma imagem neste filtro.'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {visible.map((photo) => {
              const selected = photo.kind === 'modelo' ? photo.id === templateId : artPhotoIds.includes(photo.id);
              return (
                <LibraryTile
                  key={photo.id}
                  photo={photo}
                  selected={selected}
                  onClick={() => (photo.kind === 'modelo' ? onPickTemplate(photo) : onToggleArtPhoto(photo))}
                />
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
