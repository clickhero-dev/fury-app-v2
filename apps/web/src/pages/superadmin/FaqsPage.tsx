import { useEffect, useRef, useState } from 'react';
import { Eye, Pencil, Plus, Trash2, X } from 'lucide-react';
import api from '@/lib/api';
import { MarkdownContent } from '@/components/MarkdownContent';

type Faq = { id: string; title: string; slug: string; markdown: string; status: 'draft' | 'published' };
const blank = { title: '', slug: '', markdown: '', status: 'draft' as const };
export function FaqsPage() {
  const [items, setItems] = useState<Faq[]>([]);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [viewing, setViewing] = useState<Faq | null>(null);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const load = () => api.get('/admin/faqs').then((r) => setItems(r.data.data));
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!editing) return;
    const { id, ...faqData } = editing;
    const payload = { ...faqData, ...(faqData.slug.trim() ? { slug: faqData.slug.trim() } : { slug: undefined }) };
    try {
      if (id) await api.patch(`/admin/faqs/${id}`, payload);
      else await api.post('/admin/faqs', payload);
      setEditing(null);
      setMessage('FAQ salva');
      load();
    } catch (e: any) {
      setMessage(e.response?.data?.error?.message ?? 'Erro ao salvar FAQ');
    }
  };
  const upload = async (file?: File) => {
    if (!file || !editing) return;
    const form = new FormData(); form.append('file', file);
    try {
      const { data } = await api.post('/admin/faqs/images', form);
      setEditing({ ...editing, markdown: `${editing.markdown}\n![imagem](${data.data.url})\n` });
    } catch { setMessage('Não foi possível enviar a imagem'); }
  };
  const remove = async (faq: Faq) => {
    if (!confirm(`Excluir definitivamente “${faq.title}”?`)) return;
    try { await api.delete(`/admin/faqs/${faq.id}`); setMessage('FAQ excluída'); load(); }
    catch { setMessage('Erro ao excluir FAQ'); }
  };

  return <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div><h1 className="text-2xl font-bold">FAQs</h1><p className="text-sm text-[#8A8F8B]">Central pública de ajuda</p></div>
      <button className="flex items-center gap-2 rounded-lg bg-[#1E88A8] px-4 py-2 text-sm font-medium text-white" onClick={() => setEditing({ id: '', ...blank })}><Plus size={16}/> Nova FAQ</button>
    </div>
    {message && <p role="status" className="rounded border border-[#2A2D27] p-3 text-sm">{message}</p>}

    {editing && <section className="space-y-4 rounded-lg border border-[#2A2D27] bg-[#161714] p-5">
      <div className="flex gap-3">
        <input aria-label="Título" className="flex-1 rounded bg-[#0C0D0A] p-3" placeholder="Título" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })}/>
        <select aria-label="Status" className="rounded bg-[#0C0D0A] p-3" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Faq['status'] })}><option value="draft">Rascunho</option><option value="published">Publicada</option></select>
      </div>
      <input aria-label="Slug" className="w-full rounded bg-[#0C0D0A] p-3" placeholder="slug automático (opcional)" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })}/>
      <div className="flex gap-2"><button className="rounded border border-[#2A2D27] px-3 py-2 text-sm" onClick={() => input.current?.click()}>Inserir imagem</button><input ref={input} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => upload(e.target.files?.[0])}/><span className="text-xs text-[#8A8F8B]">PNG, JPG, WebP ou GIF até 5 MB</span></div>
      <div className="grid gap-4 lg:grid-cols-2"><textarea aria-label="Conteúdo Markdown" className="min-h-96 rounded bg-[#0C0D0A] p-3 font-mono text-sm" placeholder="Escreva em Markdown" value={editing.markdown} onChange={(e) => setEditing({ ...editing, markdown: e.target.value })}/><div className="rounded bg-white p-5 text-slate-900"><MarkdownContent markdown={editing.markdown || '*A prévia aparecerá aqui.*'} /></div></div>
      <div className="flex gap-3"><button className="rounded bg-[#1E88A8] px-4 py-2 text-white" onClick={save}>Salvar</button><button className="rounded border border-[#2A2D27] px-4 py-2" onClick={() => setEditing(null)}>Cancelar</button></div>
    </section>}

    <div className="space-y-3">{items.map((faq) => <article className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#2A2D27] bg-[#161714] p-4" key={faq.id}>
      <div><h2 className="font-medium">{faq.title}</h2><p className="text-xs text-[#8A8F8B]">/{faq.slug} · {faq.status === 'published' ? 'Publicada' : 'Rascunho'}</p></div>
      <div className="flex flex-wrap gap-2">
        <button aria-label={`Ver FAQ: ${faq.title}`} className="flex items-center gap-2 rounded border border-[#2A2D27] px-3 py-2 text-sm text-[#1E88A8] hover:bg-[#1E88A8]/10" onClick={() => setViewing(faq)}><Eye size={15}/> Ver</button>
        <button aria-label={`Editar FAQ: ${faq.title}`} className="flex items-center gap-2 rounded border border-[#2A2D27] px-3 py-2 text-sm hover:bg-white/5" onClick={() => setEditing(faq)}><Pencil size={15}/> Editar</button>
        <button aria-label={`Excluir FAQ: ${faq.title}`} className="flex items-center gap-2 rounded border border-red-900/60 px-3 py-2 text-sm text-red-400 hover:bg-red-950/40" onClick={() => remove(faq)}><Trash2 size={15}/> Excluir</button>
      </div>
    </article>)}</div>

    {viewing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewing(null); }}>
      <section role="dialog" aria-modal="true" aria-label={`Visualizar FAQ: ${viewing.title}`} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[#2A2D27] bg-[#161714] p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs text-[#8A8F8B]">Prévia da FAQ · {viewing.status === 'published' ? 'Publicada' : 'Rascunho'}</p><h2 className="mt-1 text-2xl font-bold">{viewing.title}</h2><p className="mt-1 text-xs text-[#8A8F8B]">/ajuda/{viewing.slug}</p></div><button aria-label="Fechar prévia" className="rounded p-2 text-[#8A8F8B] hover:bg-white/10 hover:text-white" onClick={() => setViewing(null)}><X size={18}/></button></div>
        <div className="rounded-lg bg-white p-6 text-slate-900"><MarkdownContent markdown={viewing.markdown}/></div>
        <div className="mt-5 flex justify-end"><button className="rounded border border-[#2A2D27] px-4 py-2 text-sm" onClick={() => setViewing(null)}>Fechar</button></div>
      </section>
    </div>}
  </div>;
}
