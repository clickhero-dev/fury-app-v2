import { Check, Loader2, Upload } from 'lucide-react';
import { useBrandKit, useUploadPhotos } from '@/hooks/useBrandKit';

interface Props {
  /** URLs atualmente no contexto da geração — define quais miniaturas aparecem selecionadas. */
  contextUrls: string[];
  /** Chamado com a URL clicada, assim que selecionada (sem passo de confirmação). */
  onAdd: (urls: string[]) => void;
  /** Chamado quando o usuário clica numa miniatura já selecionada, pra tirá-la do contexto. */
  onRemove: (url: string) => void;
}

/**
 * Painel lateral sempre visível na Criação Rápida (RF-07). Upload aqui só
 * salva na biblioteca do tenant (RF-08). Clicar numa miniatura já adiciona
 * (ou remove, se já estava selecionada) direto no contexto da geração —
 * sem passo de confirmação separado (o limite de 2 e a substituição da mais
 * antiga são resolvidos pelo callback `onAdd`, compartilhado com o Upload B).
 */
export function ReferenceImagePanel({ contextUrls, onAdd, onRemove }: Props) {
  const { brandKit } = useBrandKit();
  const uploadPhotos = useUploadPhotos();

  const photoUrls = brandKit?.photo_urls ?? [];

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) uploadPhotos.mutate(files);
    e.target.value = '';
  };

  const toggleSelect = (url: string) => {
    if (contextUrls.includes(url)) {
      onRemove(url);
    } else {
      onAdd([url]);
    }
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

      <label
        className={`mt-3 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand/10 px-3 py-2.5 text-xs font-semibold text-brand transition hover:bg-brand/20 ${
          uploadPhotos.isPending ? 'cursor-wait opacity-60' : 'cursor-pointer'
        }`}
      >
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
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <Upload className="h-3.5 w-3.5" />
            Enviar fotos
          </>
        )}
      </label>

      {photoUrls.length > 0 && (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="columns-2 gap-2">
            {photoUrls.map((url) => {
              const isSelected = contextUrls.includes(url);
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => toggleSelect(url)}
                  aria-pressed={isSelected}
                  aria-label="Selecionar imagem de referência"
                  className={`relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg border-2 transition ${
                    isSelected ? 'border-brand' : 'border-transparent hover:border-border'
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

      <p className="mt-3 shrink-0 text-center text-[11px] text-text-tertiary">Selecione até 2 imagens</p>
    </aside>
  );
}
