import { useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StudioDialogShell } from './StudioDialogShell';
import { countByKind, useStudioLibrary, type LibraryKind, type LibraryPhoto } from '@/hooks/useStudioLibrary';
import { FilterChips, LibraryTile } from './ReferenceImagePanel';

export type PickerMode = 'modelo' | 'arte';

interface Props {
  mode: PickerMode | null;
  selectedIds: string[];
  /** Máximo de fotos na arte. */
  maxArt: number;
  onClose: () => void;
  onConfirm: (photos: LibraryPhoto[]) => void;
  /** Modelos: o botão de envio abre a pasta direto. */
  onUploadFiles: (files: File[]) => void;
  /** Fotos: o botão de envio pergunta Produto ou Equipe. */
  onUploadClick: () => void;
}

/** "Meus modelos" (só modelos, 1) e "Minhas fotos" (produtos/equipe, com filtro). */
export function LibraryPickerDialog({ mode, selectedIds, maxArt, onClose, onConfirm, onUploadFiles, onUploadClick }: Props) {
  const { data: photos = [], isLoading } = useStudioLibrary();
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState<'todas' | LibraryKind>('todas');

  // reabre com a seleção atual da criação
  const [prevMode, setPrevMode] = useState<PickerMode | null>(null);
  if (mode !== prevMode) {
    setPrevMode(mode);
    setPicked(selectedIds);
    setFilter('todas');
  }

  if (!mode) return null;
  const isModelo = mode === 'modelo';
  const pool = photos.filter((p) => (isModelo ? p.kind === 'modelo' : p.kind !== 'modelo'));
  const visible = filter === 'todas' ? pool : pool.filter((p) => p.kind === filter);
  const max = isModelo ? 1 : maxArt;

  const toggle = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return isModelo ? [id] : [...prev, id].slice(-max);
    });
  };

  const confirm = () => {
    const byId = new Map(photos.map((p) => [p.id, p]));
    onConfirm(picked.map((id) => byId.get(id)).filter((p): p is LibraryPhoto => !!p));
  };

  const uploadTileClass =
    'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-2 text-center text-xs font-semibold';

  return (
    <StudioDialogShell open onClose={onClose} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isModelo ? 'Escolha um modelo' : 'Fotos para colocar na arte'}</DialogTitle>
          <DialogDescription>
            {isModelo
              ? 'A gente segue o layout, as cores e o estilo do modelo e troca só os textos.'
              : `Escolha até ${maxArt}. Elas vão aparecer dentro do anúncio.`}
          </DialogDescription>
        </DialogHeader>

        {!isModelo && (
          <FilterChips options={['todas', 'produto', 'equipe']} value={filter} counts={countByKind(pool)} onChange={setFilter} />
        )}

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
          </div>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-4 gap-3 overflow-y-auto pr-1 sm:grid-cols-5">
            {isModelo ? (
              <label className={`${uploadTileClass} border-brand/50 bg-brand/5 text-brand`}>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  aria-label="Enviar novo modelo"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    if (files.length) onUploadFiles(files);
                  }}
                />
                <Upload className="h-5 w-5" />
                Enviar novo modelo
              </label>
            ) : (
              <button
                type="button"
                onClick={onUploadClick}
                className={`ady-btn ${uploadTileClass} border-amber-600/60 bg-amber-500/5 text-amber-700`}
              >
                <Upload className="h-5 w-5" />
                Enviar foto
              </button>
            )}
            {visible.map((photo) => {
              const idx = picked.indexOf(photo.id);
              return (
                <LibraryTile
                  key={photo.id}
                  photo={photo}
                  selected={idx >= 0}
                  order={isModelo || idx < 0 ? undefined : idx + 1}
                  onClick={() => toggle(photo.id)}
                />
              );
            })}
          </div>
        )}

        {!isLoading && visible.length === 0 && (
          <p className="text-center text-xs text-text-tertiary">
            {isModelo ? 'Você ainda não tem modelos. Envie um anúncio que gostou.' : 'Nenhuma foto aqui ainda.'}
          </p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-text-secondary">
            {isModelo
              ? picked.length ? '1 modelo selecionado' : 'Nenhum modelo selecionado'
              : `${picked.length} de ${maxArt} selecionadas`}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="ady-btn rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-text-primary">
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirm}
              className="ady-btn rounded-full bg-brand-hover px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isModelo ? 'Usar este modelo' : 'Usar fotos'}
            </button>
          </div>
        </DialogFooter>
    </StudioDialogShell>
  );
}
