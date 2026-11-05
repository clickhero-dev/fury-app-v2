import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export type NotificationItem = { id: string; type: 'general'; title: string; body: string; createdAt: string; readAt: string | null };
type Page = { items: NotificationItem[]; nextCursor: string | null; unreadCount: number };

const key = ['notifications'];
export function useNotifications() {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const query = useQuery<Page>({ queryKey: key, queryFn: async () => (await api.get<{ data: Page }>('/notifications?limit=20')).data.data, refetchInterval: 30000, retry: false });
  const refresh = useCallback(() => { setCursor(null); return queryClient.invalidateQueries({ queryKey: key }); }, [queryClient]);
  useEffect(() => {
    const token = localStorage.getItem('token'); if (!token) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined; let controller: AbortController | undefined;
    const connect = async (delay: number) => { if (delay) await new Promise((resolve) => { timer = setTimeout(resolve, delay); }); if (stopped) return;
      controller = new AbortController();
      try {
        const base = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '').replace(/\/api$/, '');
        const response = await fetch(`${base}/api/notifications/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error('SSE unavailable');
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (!stopped) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const chunks = buffer.split('\n\n'); buffer = chunks.pop() ?? ''; for (const chunk of chunks) { const line = chunk.split('\n').find((entry) => entry.startsWith('data: ')); if (!line) continue; try { const payload = JSON.parse(line.slice(6)) as { event?: string }; if (payload.event === 'notifications.changed') await refresh(); } catch { /* reconciliação periódica cobre payload inválido */ } } }
      } catch { if (!stopped) { timer = setTimeout(() => void connect(Math.min(delay ? delay * 2 : 1000, 30000)), delay ? 0 : 1000); } }
    };
    void connect(0); return () => { stopped = true; controller?.abort(); if (timer) clearTimeout(timer); };
  }, [refresh]);
  const markRead = async (id: string) => { await api.patch(`/notifications/${id}/read`); await refresh(); };
  const markAllRead = async () => { await api.post('/notifications/read-all'); await refresh(); };
  const loadMore = async () => { if (!query.data?.nextCursor || cursor) return; setCursor(query.data.nextCursor); const next = (await api.get<{ data: Page }>(`/notifications?limit=20&cursor=${encodeURIComponent(query.data.nextCursor)}`)).data.data; queryClient.setQueryData<Page>(key, (old) => old ? { ...next, items: [...old.items, ...next.items.filter((item) => !old.items.some((x) => x.id === item.id))] } : next); setCursor(null); };
  return { ...query, items: query.data?.items ?? [], unreadCount: query.data?.unreadCount ?? 0, markRead, markAllRead, loadMore };
}
