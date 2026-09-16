import { useState } from 'react';
import { Check, Loader2, Upload } from 'lucide-react';
import { useBrandKit, useUploadPhotos } from '@/hooks/useBrandKit';

const MAX_SELECTION = 2;

interface Props {
  /** Chamado com as URLs selecionadas quando o usuário confirma a seleção (RF-09). */
  onAddToContext: (urls: string[]) => void;
}

/**
 * Painel lateral sempre visível na Criação Rápida (RF-07). Upload aqui só
 * salva na biblioteca do tenant (RF-08) — nada entra na geração até o
 * usuário selecionar miniaturas (máx. 2) e confirmar (RF-09).
 */
export function ReferenceImagePanel({ onAddToContext }: Props) {
  const { brandKit } = useBrandKit();
  const uploadPhotos = useUploadPhotos();
  const [selected, setSelected] = useState<string[]>([]);

  const photoUrls = brandKit?.photo_urls ?? [];

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) uploadPhotos.mutate(files);
    e.target.value = '';
  };

  const toggleSelect = (url: string) => {
    setSelected((prev) => {
      if (prev.includes(url)) return prev.filter((u) => u !== url);
      if (prev.length >= MAX_SELECTION) return prev;
      return [...prev, url];
    });
  };

  const handleConfirm = () => {
    if (selected.length === 0) return;
    onAddToContext(selected);
    setSelected([]);
  };

  return (
    <aside className="sticky top-6 flex max-h-[calc(100vh-11rem)] flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-tertiary">
          Imagens de referência
        </h2>
        <p className="mt-1 text-xs text-text-tertiary">
          Envie fotos de produto ou pessoas para usar como base do anúncio.
        </p>
      </div>

      <label className="mt-3 flex w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand/10 px-3 py-2.5 text-xs font-semibold text-brand transition hover:bg-brand/20">
        <input
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={handleUpload}
          disabled={uploadPhotos.isPending}
          aria-label="Enviar fotos"
        />
        {uploadPhotos.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        Enviar fotos
      </label>

      {photoUrls.length > 0 && (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="columns-2 gap-2">
            {photoUrls.map((url) => {
              const isSelected = selected.includes(url);
              const disabled = !isSelected && selected.length >= MAX_SELECTION;
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => toggleSelect(url)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  aria-label="Selecionar imagem de referência"
                  className={`relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg border-2 transition ${
                    isSelected
                      ? 'border-brand'
                      : disabled
                        ? 'border-transparent opacity-40'
                        : 'border-transparent hover:border-border'
                  }`}
                >
                  <img src={url} alt="" className="block h-auto w-full" />
                  {isSelected && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <button
          type="button"
          onClick={handleConfirm}
          className="mt-3 w-full shrink-0 rounded-full bg-brand py-2 text-xs font-semibold text-brand-foreground transition hover:opacity-90"
        >
          Adicionar à criação{selected.length > 1 ? ` (${selected.length})` : ''}
        </button>
      )}

      <p className="mt-3 shrink-0 text-center text-[11px] text-text-tertiary">Selecione até 2 imagens</p>
    </aside>
  );
}
