import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { CreateStudioVideoPayload, StudioVideoJob, StudioVideoMeta, StudioVideoOptions } from '@/types/studio';

/** URL absoluta da prévia de música embutida (rota pública da API). */
export function builtinSongUrl(previewPath: string): string {
  return `${api.defaults.baseURL ?? ''}${previewPath}`;
}

/** Lê os metadados de vídeo do complianceNotes (null se não for vídeo do MPT). */
export function parseVideoMeta(notes: string | null | undefined): StudioVideoMeta | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    return parsed?.source === 'moneyprinterturbo' ? parsed : null;
  } catch {
    return null;
  }
}

export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

export function useStudioVideoOptions(enabled = true) {
  return useQuery({
    queryKey: ['studio-video', 'options'],
    queryFn: async () => (await api.get<StudioVideoOptions>('/studio/video/options')).data,
    enabled,
    staleTime: 60_000,
  });
}

export function useUploadVideoMusic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post<{ id: string; name: string; previewUrl: string }>('/studio/video/music', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['studio-video', 'options'] });
    },
  });
}

export function useCreateStudioVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateStudioVideoPayload) =>
      (await api.post<{ jobId: string }>('/studio/video/jobs', payload)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['studio-video', 'jobs'] });
    },
  });
}

/** Polling do status do job até concluir ou falhar. */
export function useStudioVideoJob(jobId: string | null) {
  return useQuery({
    queryKey: ['studio-video', 'job', jobId],
    queryFn: async () => (await api.get<StudioVideoJob>(`/studio/video/jobs/${jobId}`)).data,
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'done' || status === 'error' ? false : 3000;
    },
    refetchIntervalInBackground: true,
  });
}

/** Jobs de vídeo em andamento (cards "Gerando vídeo" da biblioteca). */
export function useActiveStudioVideoJobs() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['studio-video', 'jobs'],
    queryFn: async () => (await api.get<{ jobs: StudioVideoJob[] }>('/studio/video/jobs')).data.jobs,
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? 5000 : false),
  });

  // job saiu da lista = terminou → recarrega a biblioteca
  const count = query.data?.length ?? 0;
  const prevCount = useRef(count);
  useEffect(() => {
    if (count < prevCount.current) void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    prevCount.current = count;
  }, [count, queryClient]);

  return query;
}
