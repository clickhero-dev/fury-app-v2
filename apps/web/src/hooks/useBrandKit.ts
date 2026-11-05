import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { BrandKit, BrandKitApiResponse, SaveBrandKitPayload } from '../types/brandKit';

/**
 * Hook para buscar o brand kit da organização autenticada.
 *
 * - Retorna `null` se o brand kit ainda não foi configurado (404).
 * - Cache válido por 5 minutos.
 * - Não tenta novamente em caso de erro (retry: false).
 *
 * @returns `brandKit` - Dados do brand kit ou `null` se não configurado
 * @returns `isLoading` - `true` enquanto os dados estão sendo carregados
 * @returns `isError` - `true` se ocorreu um erro diferente de 404
 *
 * @example
 * const { brandKit, isLoading } = useBrandKit();
 * if (!brandKit) return <BrandKitSetup />;
 */
export function useBrandKit() {
  const query = useQuery({
    queryKey: ['brand-kit'],
    queryFn: async (): Promise<BrandKit | null> => {
      try {
        const res = await api.get<BrandKitApiResponse<BrandKit>>('/brand-kit');
        return res.data.data;
      } catch (err: any) {
        // 404 significa que o brand kit ainda não foi criado — não é um erro
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return { brandKit: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}

/**
 * Hook para salvar ou atualizar o brand kit da organização.
 * Invalida o cache do brand kit após sucesso.
 *
 * @returns Mutation do React Query para salvar o brand kit
 *
 * @example
 * const { mutate: saveBrandKit } = useSaveBrandKit();
 * saveBrandKit({ primary_color: '#FF0000', font: 'Inter' });
 */
export function useSaveBrandKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaveBrandKitPayload) => {
      const res = await api.put<BrandKitApiResponse<BrandKit>>('/brand-kit', payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kit'] });
    },
  });
}

/**
 * Hook para fazer upload do logotipo da organização.
 *
 * Após o upload bem-sucedido, salva automaticamente a URL retornada
 * no brand kit via `useSaveBrandKit`.
 *
 * @returns Mutation do React Query para upload do logo
 *
 * @example
 * const { mutate: uploadLogo } = useUploadLogo();
 * uploadLogo(file); // File selecionado pelo usuário
 */
export function useUploadLogo() {
  const saveBrandKit = useSaveBrandKit();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<BrandKitApiResponse<{ url: string }>>(
        '/brand-kit/logo',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
    onSuccess: async (data) => {
      // Persiste a URL do logo no brand kit após upload bem-sucedido
      await saveBrandKit.mutateAsync({ logo_url: data.url });
    },
  });
}

/**
 * Hook para fazer upload de múltiplas fotos da organização.
 * Invalida o cache do brand kit após sucesso.
 *
 * @returns Mutation do React Query para upload de fotos
 *
 * @example
 * const { mutate: uploadPhotos } = useUploadPhotos();
 * uploadPhotos([file1, file2]); // Array de arquivos selecionados
 */
export function useUploadPhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files[]', file));
      const res = await api.post<BrandKitApiResponse<{ urls: string[] }>>(
        '/brand-kit/photos',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kit'] });
    },
  });
}

/**
 * Hook para remover uma foto do brand kit da organização.
 * Invalida o cache do brand kit após sucesso.
 *
 * @returns Mutation do React Query para deleção de foto
 *
 * @example
 * const { mutate: deletePhoto } = useDeletePhoto();
 * deletePhoto('https://r2.example.com/foto.jpg');
 */
export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      const res = await api.delete<BrandKitApiResponse<{ photo_urls: string[] }>>(
        '/brand-kit/photos',
        { data: { url } }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kit'] });
    },
  });
}