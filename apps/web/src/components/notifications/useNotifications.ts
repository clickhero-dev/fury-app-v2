import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { errorMessage } from '@/lib/error-message';

export type NotificationItem = { id: string; type: 'general'; title: string; body: string; actionUrl: string | null; createdAt: string; readAt: string | null };
type Page = { items: NotificationItem[]; nextCursor: string | null; unreadCount: number };

const key = ['notifications'];
export function useNotifications() {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
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
  // falha de ação vira mensagem com motivo
  const attempt = async (action: string, run: () => Promise<void>) => { setActionError(''); try { await run(); } catch (err) { setActionError(errorMessage(err, action)); } };
  const markRead = (id: string) => attempt('Não foi possível marcar como lida', async () => { await api.patch(`/notifications/${id}/read`); await refresh(); });
  const markAllRead = () => attempt('Não foi possível marcar todas como lidas', async () => { await api.post('/notifications/read-all'); await refresh(); });
  const loadMore = async () => { if (!query.data?.nextCursor || cursor) return; const next = query.data.nextCursor; setCursor(next); await attempt('Não foi possível carregar mais notificações', async () => { const page = (await api.get<{ data: Page }>(`/notifications?limit=20&cursor=${encodeURIComponent(next)}`)).data.data; queryClient.setQueryData<Page>(key, (old) => old ? { ...page, items: [...old.items, ...page.items.filter((item) => !old.items.some((x) => x.id === item.id))] } : page); }); setCursor(null); };
  return { ...query, items: query.data?.items ?? [], unreadCount: query.data?.unreadCount ?? 0, markRead, markAllRead, loadMore, actionError };
}
