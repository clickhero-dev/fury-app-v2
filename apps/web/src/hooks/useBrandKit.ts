import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { BrandKit, BrandKitApiResponse, SaveBrandKitPayload } from '../types/brandKit';

export function useBrandKit() {
  const query = useQuery({
    queryKey: ['brand-kit'],
    queryFn: async (): Promise<BrandKit | null> => {
      try {
        const res = await api.get<BrandKitApiResponse<BrandKit>>('/brand-kit');
        return res.data.data;
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return { brandKit: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}

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

export function useUploadLogo() {
  const saveBrandKit = useSaveBrandKit();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<BrandKitApiResponse<{ url: string }>>('/brand-kit/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: async (data) => {
      await saveBrandKit.mutateAsync({ logo_url: data.url });
    },
  });
}

export function useUploadPhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files[]', file));
      const res = await api.post<BrandKitApiResponse<{ urls: string[] }>>('/brand-kit/photos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kit'] });
    },
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      const res = await api.delete<BrandKitApiResponse<{ photo_urls: string[] }>>('/brand-kit/photos', {
        data: { url },
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kit'] });
    },
  });
}
