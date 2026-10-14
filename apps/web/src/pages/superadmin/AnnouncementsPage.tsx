import { useEffect, useRef, useState } from 'react';
import { Pause, Pencil, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { MarkdownContent } from '@/components/MarkdownContent';
import { markdownBodyClass } from '@/components/layout/AnnouncementsModal';

type Announcement = { id: string; title: string; markdown: string; isActive: boolean; showToNewUsers: boolean; endsAt: string | null; publishedAt?: string | null };
const blank: Announcement = { id: '', title: '', markdown: '', isActive: true, showToNewUsers: false, endsAt: null };
// ISO -> valor do <input type="datetime-local"> no fuso local
const toLocalInput = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
function Switch({ label, checked, onChange, title, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string; disabled?: boolean }) {
  return <label className={`flex items-center gap-2 ${disabled ? 'opacity-40' : 'cursor-pointer'}`} title={title}>
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-[#1E88A8]' : 'bg-[#3A3D37]'}`}>
      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`}/>
    </button>{label}
  </label>;
}
const statusLabel = (a: Announcement) => !a.isActive ? 'Inativo' : a.endsAt && new Date(a.endsAt) <= new Date() ? 'Expirado' : 'Ativo';
const audienceLabel = (a: Announcement) => a.showToNewUsers ? 'todos, sem encerramento' : a.endsAt ? `todos até ${new Date(a.endsAt).toLocaleString('pt-BR')}` : 'só usuários já cadastrados';

export function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [message, setMessage] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [plainText, setPlainText] = useState('');
  const [formatting, setFormatting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const load = () => api.get('/admin/announcements').then((r) => setItems(r.data.data));
  useEffect(() => { load(); }, []);
  const edit = (a: Announcement | null) => { setEditing(a); setAiOpen(false); setPlainText(''); };
  const save = async () => {
    if (!editing) return;
    const { id, title, markdown, isActive, showToNewUsers, endsAt } = editing;
    const payload = { title, markdown, isActive, showToNewUsers, endsAt };
    try {
      if (id) await api.patch(`/admin/announcements/${id}`, payload);
      else await api.post('/admin/announcements', payload);
      edit(null);
      setMessage('Aviso salvo');
      load();
    } catch (e: any) {
      setMessage(e.response?.data?.error?.message ?? 'Erro ao salvar aviso');
    }
  };
  const transform = async () => {
    // IA só gera texto base com o editor vazio
    if (!editing || !plainText.trim() || editing.markdown.trim()) return;
    setFormatting(true);
    try {
      const { data } = await api.post('/admin/announcements/format', { text: plainText });
      setEditing({ ...editing, markdown: data.data.markdown });
      setMessage('Texto transformado. Revise antes de salvar.');
    } catch (e: any) {
      setMessage(e.response?.data?.error?.message ?? 'Não foi possível transformar o texto');
    } finally { setFormatting(false); }
  };
  const upload = async (file?: File) => {
    if (!file || !editing) return;
    // posição do cursor antes do upload
    const at = editor.current?.selectionStart ?? editing.markdown.length;
    const form = new FormData(); form.append('file', file);
    try {
      const { data } = await api.post('/admin/faqs/images', form);
      const md = editing.markdown;
      setEditing({ ...editing, markdown: `${md.slice(0, at)}\n![imagem](${data.data.url})\n${md.slice(at)}` });
    } catch { setMessage('Não foi possível enviar a imagem'); }
  };
  const toggle = async (a: Announcement) => {
    try { await api.patch(`/admin/announcements/${a.id}`, { isActive: !a.isActive }); load(); }
    catch (e: any) { setMessage(e.response?.data?.error?.message ?? 'Erro ao alterar aviso'); }
  };
  const remove = async (a: Announcement) => {
    if (!confirm(`Excluir definitivamente “${a.title}”?`)) return;
    try { await api.delete(`/admin/announcements/${a.id}`); setMessage('Aviso excluído'); load(); }
    catch { setMessage('Erro ao excluir aviso'); }
  };

  return <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div><h1 className="text-2xl font-bold">Avisos</h1><p className="text-sm text-[#8A8F8B]">Novidades exibidas uma vez para cada usuário ao entrar</p></div>
      <button className="flex items-center gap-2 rounded-lg bg-[#1E88A8] px-4 py-2 text-sm font-medium text-white" onClick={() => edit({ ...blank })}><Plus size={16}/> Novo aviso</button>
    </div>
    {message && <p role="status" className="rounded border border-[#2A2D27] p-3 text-sm">{message}</p>}

    {editing && <section className="space-y-4 rounded-lg border border-[#2A2D27] bg-[#161714] p-5">
      <input aria-label="Título" className="w-full rounded bg-[#0C0D0A] p-3" placeholder="Título" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })}/>
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <Switch label="Ativo" checked={editing.isActive} onChange={(v) => setEditing({ ...editing, isActive: v })}/>
        <Switch label="Manter ativo" title="Mostra para todos, antigos e novos, até você desligar" disabled={!!editing.endsAt} checked={editing.showToNewUsers} onChange={(v) => setEditing({ ...editing, showToNewUsers: v })}/>
        <label className={`flex items-center gap-2 ${editing.showToNewUsers ? 'opacity-40' : ''}`} title="Mostra para todos, antigos e novos, até a data">Definir encerramento <input type="datetime-local" aria-label="Definir encerramento" disabled={editing.showToNewUsers} className="rounded bg-[#0C0D0A] p-2" value={toLocalInput(editing.endsAt)} onChange={(e) => setEditing({ ...editing, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}/></label>
        {editing.endsAt && <button type="button" className="text-sm text-[#1E88A8] hover:underline" onClick={() => setEditing({ ...editing, endsAt: null })}>Limpar data</button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="rounded border border-[#2A2D27] px-3 py-2 text-sm" onClick={() => input.current?.click()}>Inserir imagem</button><input ref={input} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => upload(e.target.files?.[0])}/>
        <button className="flex items-center gap-2 rounded border border-[#2A2D27] px-3 py-2 text-sm disabled:opacity-50" disabled={!!editing.markdown.trim()} title={editing.markdown.trim() ? 'Disponível só com o conteúdo vazio' : undefined} onClick={() => setAiOpen(!aiOpen)}><Sparkles size={15}/> Gerar texto base com IA</button>
      </div>
      {aiOpen && !editing.markdown.trim() && <div className="space-y-2 rounded border border-[#2A2D27] p-3">
        <textarea aria-label="Texto simples" className="min-h-32 w-full rounded bg-[#0C0D0A] p-3 text-sm" placeholder="Cole o texto simples. A IA só corrige e formata, sem adicionar informações." value={plainText} onChange={(e) => setPlainText(e.target.value)}/>
        <button className="rounded bg-[#1E88A8] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={formatting || !plainText.trim()} onClick={transform}>{formatting ? 'Transformando…' : 'Transformar'}</button>
      </div>}
      <div className="grid gap-4 lg:grid-cols-2"><textarea ref={editor} aria-label="Conteúdo Markdown" className="min-h-96 rounded bg-[#0C0D0A] p-3 font-mono text-sm" placeholder="Escreva em Markdown" value={editing.markdown} onChange={(e) => setEditing({ ...editing, markdown: e.target.value })}/><div className={`rounded border border-[#2A2D27] bg-[#0C0D0A] p-5 ${markdownBodyClass}`}><MarkdownContent markdown={editing.markdown || '*A prévia aparecerá aqui.*'} /></div></div>
      <div className="flex gap-3"><button className="rounded bg-[#1E88A8] px-4 py-2 text-white" onClick={save}>Salvar</button><button className="rounded border border-[#2A2D27] px-4 py-2" onClick={() => edit(null)}>Cancelar</button></div>
    </section>}

    <div className="space-y-3">{items.map((a) => <article className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#2A2D27] bg-[#161714] p-4" key={a.id}>
      <div><h2 className="font-medium">{a.title}</h2><p className="text-xs text-[#8A8F8B]">{statusLabel(a)} · {audienceLabel(a)}</p></div>
      <div className="flex flex-wrap gap-2">
        {a.isActive
          ? <button aria-label={`Desativar aviso: ${a.title}`} className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500/25" onClick={() => toggle(a)}><Pause size={14}/> Desativar</button>
          : <button aria-label={`Ativar aviso: ${a.title}`} className="flex items-center gap-1.5 rounded-full border border-[#1E88A8]/30 bg-[#1E88A8]/10 px-3.5 py-2 text-sm font-semibold text-[#1E88A8] hover:bg-[#1E88A8]/25" onClick={() => toggle(a)}><Play size={14}/> Ativar</button>}
        <button aria-label={`Editar aviso: ${a.title}`} className="flex items-center gap-2 rounded border border-[#2A2D27] px-3 py-2 text-sm hover:bg-white/5" onClick={() => edit(a)}><Pencil size={15}/> Editar</button>
        <button aria-label={`Excluir aviso: ${a.title}`} className="flex items-center gap-2 rounded border border-red-900/60 px-3 py-2 text-sm text-red-400 hover:bg-red-950/40" onClick={() => remove(a)}><Trash2 size={15}/> Excluir</button>
      </div>
    </article>)}</div>
  </div>;
}
