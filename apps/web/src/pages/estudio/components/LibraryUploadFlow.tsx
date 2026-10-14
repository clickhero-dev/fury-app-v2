import { useEffect, useMemo, useState } from 'react';
import { Info, LayoutTemplate, Loader2, Package, Plus, Upload, Users, X } from 'lucide-react';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StudioDialogShell } from './StudioDialogShell';
import { KIND_META, LibraryUploadError, useUploadLibraryPhotos, type LibraryKind, type LibraryPhoto } from '@/hooks/useStudioLibrary';

export interface UploadRequest {
  /** Tipos oferecidos; com um só, o tipo já vem definido (sem pergunta). */
  kinds: LibraryKind[];
  /** Máximo de arquivos neste envio; null = sem limite. */
  max: number | null;
  /** Arquivos já escolhidos (quando o botão abriu a pasta direto). */
  files?: File[];
  onDone?: (photos: LibraryPhoto[]) => void;
}

interface Props {
  request: UploadRequest | null;
  onClose: () => void;
}

const ACCEPT = 'image/png,image/jpeg';

const KIND_ICON = { modelo: LayoutTemplate, produto: Package, equipe: Users } as const;
const KIND_ICON_BG: Record<LibraryKind, string> = {
  modelo: 'bg-brand/10 text-brand',
  produto: 'bg-amber-500/15 text-amber-700',
  equipe: 'bg-violet-500/10 text-violet-700',
};

const NOUN: Record<LibraryKind, [string, string]> = {
  modelo: ['modelo', 'modelos'],
  produto: ['produto', 'produtos'],
  equipe: ['foto', 'fotos'],
};

function clamp(files: File[], max: number | null) {
  return max === null ? files : files.slice(0, max);
}

/**
 * Envio para a biblioteca do Estúdio: escolher o tipo (botões no estilo do
 * "Novo post") → pasta do computador → conferir miniaturas → enviar.
 * A imagem fica salva com o tipo escolhido.
 */
export function LibraryUploadFlow({ request, onClose }: Props) {
  const upload = useUploadLibraryPhotos();
  const [kind, setKind] = useState<LibraryKind | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [overflow, setOverflow] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // reinicia quando chega um novo pedido de envio
  const [prevRequest, setPrevRequest] = useState<UploadRequest | null>(null);
  if (request !== prevRequest) {
    setPrevRequest(request);
    const initial = request?.files ?? [];
    setKind(request?.kinds.length === 1 ? request.kinds[0] : null);
    setFiles(clamp(initial, request?.max ?? null));
    setOverflow(request?.max != null && initial.length > request.max);
    setProgress(null);
    setErrorText(null);
  }

  const resetUpload = upload.reset;
  useEffect(() => {
    resetUpload();
  }, [request, resetUpload]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  if (!request) return null;
  const max = request.max;
  const isArte = request.kinds.length === 2;
  // tipo só é definido junto com a escolha dos arquivos (ou já vem do botão)
  const step: 'kind' | 'confirm' = kind ? 'confirm' : 'kind';

  const addFiles = (picked: File[], chosen: LibraryKind) => {
    const all = [...files, ...picked];
    setOverflow(max !== null && all.length > max);
    setFiles(clamp(all, max));
    setKind(chosen);
  };

  const handleSubmit = () => {
    if (!kind || files.length === 0) return;
    setErrorText(null);
    setProgress({ sent: 0, total: files.length });
    upload.mutate(
      { kind, files, onProgress: (sent, total) => setProgress({ sent, total }) },
      {
        onSuccess: (photos) => {
          request.onDone?.(photos);
          onClose();
        },
        onError: (err) => {
          setProgress(null);
          const saved = err instanceof LibraryUploadError ? err.saved.length : 0;
          // as já salvas saem da lista; tentar de novo envia só o resto
          if (saved > 0) setFiles((prev) => prev.slice(saved));
          setErrorText(
            saved > 0
              ? `${saved} de ${files.length} imagens foram salvas. As demais não foram enviadas: ${err.message} Tente de novo.`
              : `Não foi possível enviar: ${err.message} Confira os arquivos (PNG ou JPG, até 5MB) e tente de novo.`,
          );
        },
      },
    );
  };

  if (step === 'kind') {
    return (
      <StudioDialogShell open onClose={onClose} className={isArte ? 'max-w-md' : 'max-w-xl'}>
          <DialogHeader>
            <DialogTitle>{isArte ? 'Enviar foto para a arte' : 'Enviar imagens'}</DialogTitle>
            <DialogDescription>{isArte ? 'O que aparece na foto?' : 'O que você vai enviar?'}</DialogDescription>
          </DialogHeader>
          <div className={`grid gap-3 ${request.kinds.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {request.kinds.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <label
                  key={k}
                  className="group flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-border p-5 text-center transition-all hover:border-brand/50 hover:bg-brand/5"
                >
                  <input
                    type="file"
                    accept={ACCEPT}
                    multiple={max !== 1}
                    className="sr-only"
                    aria-label={`Enviar como ${KIND_META[k].label}`}
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []);
                      e.target.value = '';
                      if (picked.length) addFiles(picked, k);
                    }}
                  />
                  <span className={`flex h-12 w-12 items-center justify-center rounded-full ${KIND_ICON_BG[k]}`}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-text-primary">{KIND_META[k].label}</span>
                    <span className="mt-0.5 block text-xs text-text-tertiary">{KIND_META[k].description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="flex items-start gap-2 rounded-lg bg-surface-secondary px-3 py-2.5 text-xs leading-relaxed text-text-secondary">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {isArte ? (
              <span>
                Envie <strong className="text-text-primary">no máximo {max} fotos</strong>. Elas serão salvas como o tipo que você
                escolher e já entram nesta criação.
              </span>
            ) : (
              <span>
                Todas as imagens que você escolher serão salvas como{' '}
                <strong className="text-text-primary">o tipo do botão que você clicar</strong>. Pode enviar quantas quiser.
              </span>
            )}
          </p>
      </StudioDialogShell>
    );
  }

  const k = kind as LibraryKind;
  const n = files.length;
  const canAddMore = max === null || n < max;
  const limitText = max === 1 ? 'Só 1 imagem por modelo.' : max ? `No máximo ${max} fotos. Elas já entram nesta criação. (${n} de ${max})` : 'Pode enviar quantas quiser.';

  return (
    <StudioDialogShell open onClose={() => !upload.isPending && onClose()} className="max-w-xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Conferir antes de enviar</DialogTitle>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${KIND_META[k].badgeClass}`}>{KIND_META[k].label}</span>
          </div>
          <DialogDescription>
            {n === 1 ? `Esta imagem será salva como ${KIND_META[k].label}.` : `Todas as imagens abaixo serão salvas como ${KIND_META[k].label}.`}
          </DialogDescription>
          <p className="text-xs text-text-tertiary">{limitText}</p>
        </DialogHeader>

        {overflow && (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-text-primary">
            Você escolheu mais do que o limite; ficaram só as primeiras {max}.
          </p>
        )}

        {/* muitas imagens: a grade rola dentro do modal */}
        <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto pr-1">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="flex min-w-0 flex-col gap-1.5">
              <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-secondary">
                <img src={previews[i]} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setFiles((prev) => prev.filter((_, idx) => idx !== i));
                    setOverflow(false);
                  }}
                  disabled={upload.isPending}
                  aria-label="Tirar esta imagem"
                  className="ady-btn absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text-secondary hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="truncate text-xs text-text-secondary">{file.name}</span>
            </div>
          ))}
          {canAddMore && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-surface-secondary text-xs font-semibold text-text-secondary hover:border-brand/50">
              <input
                type="file"
                accept={ACCEPT}
                multiple={max !== 1}
                className="sr-only"
                aria-label="Escolher mais imagens"
                disabled={upload.isPending}
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (picked.length) addFiles(picked, k);
                }}
              />
              <Plus className="h-5 w-5" />
              {n === 0 ? 'Escolher' : 'Escolher mais'}
            </label>
          )}
        </div>

        {k === 'modelo' && <p className="text-xs text-text-tertiary">Use artes suas ou que você tenha direito de usar.</p>}
        {errorText && <p className="text-xs text-destructive">{errorText}</p>}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={upload.isPending}
            className="ady-btn rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-text-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={n === 0 || upload.isPending}
            className="ady-btn inline-flex items-center justify-center gap-2 rounded-full bg-brand-hover px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {upload.isPending && progress
              ? `Enviando ${progress.sent} de ${progress.total}...`
              : n === 1 ? `Enviar 1 ${NOUN[k][0]}` : `Enviar ${n} ${NOUN[k][1]}`}
          </button>
        </DialogFooter>
    </StudioDialogShell>
  );
}
