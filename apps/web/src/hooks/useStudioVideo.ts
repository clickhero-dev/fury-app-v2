import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  CreateStudioVideoPayload,
  StudioVideoAspect,
  StudioVideoJob,
  StudioVideoMeta,
  StudioVideoOptions,
  StudioVideoScriptResponse,
} from '@/types/studio';

/** Lê os metadados de vídeo do complianceNotes (null se não for vídeo deste fluxo). */
export function parseVideoMeta(notes: string | null | undefined): StudioVideoMeta | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    return parsed?.source === 'openrouter-video' ? parsed : null;
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

export function useGenerateVideoScript() {
  return useMutation({
    mutationFn: async (payload: { prompt: string; photoIds: string[]; aspectRatio: StudioVideoAspect; duration: number }) =>
      (await api.post<StudioVideoScriptResponse>('/studio/video/script', payload)).data,
  });
}

export function useCreateStudioVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateStudioVideoPayload) =>
      (await api.post<{ jobId: string }>('/studio/video/jobs', payload)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['studio-video', 'jobs'] });
      // saldo de vídeos do mês
      void queryClient.invalidateQueries({ queryKey: ['studio-video', 'options'] });
    },
  });
}

export function useAdjustStudioVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, feedback }: { assetId: string; feedback: string }) =>
      (await api.post<{ jobId: string }>(`/studio/video/assets/${assetId}/adjust`, { feedback })).data,
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
      return status === 'done' || status === 'error' ? false : 4000;
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
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? 8000 : false),
  });

  // algum job saiu da lista = terminou → recarrega a biblioteca
  const ids = (query.data ?? []).map((j) => j.jobId).join(',');
  const prevIds = useRef(ids);
  useEffect(() => {
    const current = new Set(ids.split(',').filter(Boolean));
    if (prevIds.current.split(',').some((id) => id && !current.has(id))) {
      void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    }
    prevIds.current = ids;
  }, [ids, queryClient]);

  return query;
}
