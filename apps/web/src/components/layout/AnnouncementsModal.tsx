import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { MarkdownContent } from '@/components/MarkdownContent';
import { Button } from '@/components/ui/button';

type PendingAnnouncement = { id: string; title: string; markdown: string };
const block = (e: Event) => e.preventDefault();
// Sem plugin de tipografia: estilo mínimo de Markdown, legível nos dois temas
export const markdownBodyClass = 'text-text-primary [&_h1]:mb-3 [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_strong]:font-semibold [&_a]:text-[#1E88A8] [&_a]:underline [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg';

/** Avisos pendentes em sequência; só fecha via Confirmar. */
export function AnnouncementsModal({ enabled }: { enabled: boolean }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ['announcements-pending'],
    queryFn: async () => (await api.get<{ data: PendingAnnouncement[] }>('/announcements/pending')).data.data,
    enabled,
    staleTime: Infinity,
    retry: false,
  });
  const current = data[step];
  if (!enabled || !current) return null;

  const confirm = async () => {
    setSaving(true);
    // Falha não trava: o aviso volta no próximo login
    try { await api.post(`/announcements/${current.id}/seen`); } catch { /* noop */ }
    setSaving(false);
    setStep(step + 1);
  };

  return <DialogPrimitive.Root open>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <DialogPrimitive.Content
        onEscapeKeyDown={block} onPointerDownOutside={block} onInteractOutside={block}
        aria-describedby={undefined}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-lg">
        {data.length > 1 && <p className="text-xs text-text-secondary">{step + 1} de {data.length}</p>}
        <DialogPrimitive.Title className="text-xl font-bold text-text-primary">{current.title}</DialogPrimitive.Title>
        <div className={`overflow-y-auto ${markdownBodyClass}`}><MarkdownContent markdown={current.markdown} /></div>
        <div className="flex justify-end"><Button variant="primary" onClick={confirm} disabled={saving}>Confirmar</Button></div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
