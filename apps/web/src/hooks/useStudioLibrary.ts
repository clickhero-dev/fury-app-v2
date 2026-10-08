import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export type LibraryKind = 'modelo' | 'produto' | 'equipe';

export interface LibraryPhoto {
  id: string;
  kind: LibraryKind;
  url: string;
  created_at: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/** Rótulos e cores de cada tipo — mesma fonte para painel, modais e etiquetas. */
export const KIND_META: Record<LibraryKind, { label: string; plural: string; description: string; badgeClass: string; ringClass: string }> = {
  modelo: {
    label: 'Modelo',
    plural: 'Modelos',
    description: 'Anúncio para copiar o estilo',
    badgeClass: 'bg-brand-hover text-white',
    ringClass: 'border-brand',
  },
  produto: {
    label: 'Produto',
    plural: 'Produtos',
    description: 'O que você vende',
    badgeClass: 'bg-amber-700 text-white',
    ringClass: 'border-amber-600',
  },
  equipe: {
    label: 'Equipe',
    plural: 'Equipe',
    description: 'Você, equipe ou clientes',
    badgeClass: 'bg-violet-700 text-white',
    ringClass: 'border-violet-600',
  },
};

export type LibraryFilter = 'todas' | LibraryKind;

export function countByKind(photos: LibraryPhoto[]): Record<LibraryFilter, number> {
  return {
    todas: photos.length,
    modelo: photos.filter((p) => p.kind === 'modelo').length,
    produto: photos.filter((p) => p.kind === 'produto').length,
    equipe: photos.filter((p) => p.kind === 'equipe').length,
  };
}

const LIBRARY_KEY = ['studio-library'] as const;

/** Biblioteca de imagens do Estúdio (todas; filtros são feitos na tela). */
export function useStudioLibrary() {
  return useQuery({
    queryKey: LIBRARY_KEY,
    queryFn: async () => {
      const res = await api.get<ApiResponse<LibraryPhoto[]>>('/brand-kit/library');
      return res.data.data;
    },
  });
}

const UPLOAD_BATCH = 10;

/** Falha no meio do envio: carrega as fotos que já foram salvas. */
export class LibraryUploadError extends Error {
  constructor(public saved: LibraryPhoto[], message: string) {
    super(message);
  }
}

/** Envia imagens já com o tipo escolhido, em lotes de 10; devolve as fotos criadas. */
export function useUploadLibraryPhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kind,
      files,
      onProgress,
    }: {
      kind: LibraryKind;
      files: File[];
      onProgress?: (sent: number, total: number) => void;
    }) => {
      const saved: LibraryPhoto[] = [];
      for (let i = 0; i < files.length; i += UPLOAD_BATCH) {
        const formData = new FormData();
        formData.append('kind', kind);
        files.slice(i, i + UPLOAD_BATCH).forEach((file) => formData.append('files[]', file));
        try {
          const res = await api.post<ApiResponse<LibraryPhoto[]>>('/brand-kit/library', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          saved.push(...res.data.data);
        } catch (err) {
          const apiMessage = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
          throw new LibraryUploadError(saved, apiMessage ?? 'Não foi possível enviar.');
        }
        onProgress?.(Math.min(i + UPLOAD_BATCH, files.length), files.length);
      }
      return saved;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: LIBRARY_KEY });
    },
  });
}
