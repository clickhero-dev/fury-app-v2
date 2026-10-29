import { useState } from 'react';
import { ImagePlus, MapPin, Star } from 'lucide-react';
import { sprint7MockPhotos, sprint7MockReviews, type Sprint7Photo, type Sprint7Review } from '@/lib/google-sprint-7-mock-data';

const tabs = ['Visão geral', 'Avaliações', 'Fotos', 'Perfil'] as const;
type ProfileTab = (typeof tabs)[number];

function ReviewCard({ review, onSaveNote, onSaveReply }: {
  review: Sprint7Review;
  onSaveNote: (id: string, note: string) => void;
  onSaveReply: (id: string, reply: string) => void;
}) {
  const [note, setNote] = useState(review.internalNote ?? '');
  const [reply, setReply] = useState(review.publicReply ?? '');
  const [replyOpen, setReplyOpen] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [replySaved, setReplySaved] = useState(Boolean(review.publicReply));

  return (
    <article data-testid={`review-${review.id}`} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-semibold text-text-primary">{review.author}</p><p className="text-xs text-text-secondary">{review.dateLabel}</p></div>
        <span aria-label={`${review.rating} de 5 estrelas`} className="inline-flex items-center gap-1 text-sm text-accent"><Star size={15} aria-hidden="true" fill="currentColor" />{review.rating}</span>
      </div>
      <p className="text-sm leading-6 text-text-primary">{review.text}</p>
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
        <label htmlFor={`note-${review.id}`} className="block text-xs font-semibold text-text-secondary">Nota interna (só para sua equipe)</label>
        <textarea id={`note-${review.id}`} aria-label="Nota interna (só para sua equipe)" value={note} onChange={(event) => { setNote(event.target.value); setNoteSaved(false); }} rows={2} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary" placeholder="Anotação privada para a equipe" />
        <div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-text-secondary">Privada · não aparece no Google</span><button type="button" onClick={() => { onSaveNote(review.id, note); setNoteSaved(true); }} className="min-h-9 rounded-full border border-border px-3 text-xs font-semibold text-text-primary">Salvar nota interna</button></div>
        {noteSaved && <p role="status" className="mt-2 text-xs text-success">Nota privada salva nesta demonstração</p>}
      </div>
      {review.publicReply ? (
        <div data-public-reply className="rounded-xl bg-surface-secondary p-4"><p className="text-xs font-semibold text-text-secondary">Resposta pública</p><p className="mt-1 text-sm text-text-primary">{review.publicReply}</p><p className="mt-2 text-xs text-text-secondary">Exemplo · não enviada ao Google</p></div>
      ) : replyOpen ? (
        <div className="space-y-2"><label htmlFor={`reply-${review.id}`} className="sr-only">Resposta pública</label><textarea id={`reply-${review.id}`} aria-label="Resposta pública" value={reply} onChange={(event) => setReply(event.target.value)} rows={2} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary" placeholder="Escreva uma resposta visível ao público" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setReplyOpen(false)} className="min-h-9 px-3 text-xs text-text-secondary">Cancelar</button><button type="button" disabled={!reply.trim()} onClick={() => { onSaveReply(review.id, reply); setReplySaved(true); setReplyOpen(false); }} className="min-h-9 rounded-full bg-brand px-4 text-xs font-semibold text-white disabled:opacity-50">Enviar resposta</button></div></div>
      ) : <button type="button" onClick={() => { setReplyOpen(true); setReplySaved(false); }} className="min-h-10 rounded-full border border-brand px-4 text-sm font-semibold text-brand">Responder</button>}
      {replySaved && !review.publicReply && <p role="status" className="text-xs text-text-secondary">Resposta salva apenas nesta demonstração</p>}
    </article>
  );
}

export function GoogleMeuNegocioMock() {
  const [activeTab, setActiveTab] = useState<ProfileTab>('Visão geral');
  const [reviews, setReviews] = useState<Sprint7Review[]>(() => sprint7MockReviews.map((review) => ({ ...review })));
  const [photos, setPhotos] = useState<Sprint7Photo[]>(() => sprint7MockPhotos.map((photo) => ({ ...photo })));
  const [selectedFileName, setSelectedFileName] = useState('');

  const saveNote = (id: string, internalNote: string) => setReviews((current) => current.map((review) => review.id === id ? { ...review, internalNote } : review));
  const saveReply = (id: string, publicReply: string) => setReviews((current) => current.map((review) => review.id === id ? { ...review, publicReply } : review));
  const addPhoto = (file?: File) => {
    if (!file) return;
    setSelectedFileName(file.name);
    setPhotos((current) => [...current, { id: `local-${current.length}`, title: file.name, tone: 'shop' }]);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 sm:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Perfil da Empresa no Google</p><h1 className="mt-2 text-2xl font-bold text-text-primary">Padaria Modelo</h1><p className="mt-1 flex items-center gap-1.5 text-sm text-text-secondary"><MapPin size={15} aria-hidden="true" />Rua das Flores, 120 · São Paulo, SP</p></div><span className="h-fit rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent">Dados demonstrativos</span></header>
      <nav role="tablist" aria-label="Seções do Perfil Google" className="flex gap-2 overflow-x-auto border-b border-border">{tabs.map((tab) => <button key={tab} role="tab" type="button" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${activeTab === tab ? 'border-brand text-brand' : 'border-transparent text-text-secondary'}`}>{tab}</button>)}</nav>
      <section role="tabpanel" aria-label={activeTab} className="space-y-5">
        {activeTab === 'Visão geral' && <><div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]"><article className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-text-primary">Seu negócio no Google</h2><p className="mt-1 text-sm text-text-secondary">Padaria · Aberto agora até 19h</p></div><span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">Verificado</span></div><div className="mt-5 flex items-end gap-2"><span className="text-4xl font-bold text-text-primary">4,8</span><span className="pb-1 text-sm text-text-secondary">de 5 · 126 avaliações</span></div><div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">{[['2,4 mil', 'visualizações'], ['318', 'ações'], ['12', 'fotos']].map(([value, label]) => <div key={label}><p className="font-semibold text-text-primary">{value}</p><p className="mt-1 text-xs text-text-secondary">{label}</p></div>)}</div></article><article className="rounded-2xl border border-border bg-surface p-5"><h2 className="font-semibold text-text-primary">Qualidade do perfil</h2><p className="mt-1 text-sm text-text-secondary">Seu perfil está completo</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-secondary"><div className="h-full w-[84%] rounded-full bg-brand" /></div><p className="mt-2 text-right text-xs text-text-secondary">84% · exemplo</p><ul className="mt-4 space-y-2 text-sm text-text-secondary"><li>✓ Horários informados</li><li>✓ Telefone e endereço</li><li>＋ Adicione fotos recentes</li></ul></article></div><p className="text-xs text-text-secondary">Todos os números são exemplos fictícios para avaliação da interface.</p></>}
        {activeTab === 'Avaliações' && <div className="space-y-4"><div><h2 className="font-semibold text-text-primary">Avaliações dos clientes</h2><p className="mt-1 text-sm text-text-secondary">Leia, anote para sua equipe ou prepare uma resposta.</p></div>{reviews.map((review) => <ReviewCard key={review.id} review={review} onSaveNote={saveNote} onSaveReply={saveReply} />)}</div>}
        {activeTab === 'Fotos' && <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-text-primary">Fotos do seu negócio</h2><p className="mt-1 text-sm text-text-secondary">Organize imagens para o Perfil da Empresa.</p></div><label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-white"><ImagePlus size={17} aria-hidden="true" />Adicionar foto<input aria-label="Adicionar foto de demonstração" type="file" accept="image/*" className="sr-only" onChange={(event) => addPhoto(event.target.files?.[0])} /></label></div><p className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-sm text-text-secondary">Demonstração: as fotos ficam somente nesta tela. Nenhum arquivo é enviado ao Google.</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{photos.map((photo) => <article key={photo.id} className="overflow-hidden rounded-xl border border-border bg-surface"><div className="grid aspect-square place-items-center bg-surface-secondary text-text-tertiary"><ImagePlus size={28} aria-hidden="true" /></div><p className="truncate p-3 text-xs font-medium text-text-primary" title={photo.title}>{photo.title}</p></article>)}</div>{selectedFileName && <p role="status" className="text-sm text-success">Prévia local adicionada: {selectedFileName} · não foi enviada ao Google.</p>}</div>}
        {activeTab === 'Perfil' && <article className="rounded-2xl border border-border bg-surface p-5"><h2 className="font-semibold text-text-primary">Informações do negócio</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2">{[['Categoria', 'Padaria'], ['Telefone', '(11) 3333-1212'], ['Endereço', 'Rua das Flores, 120 · São Paulo, SP'], ['Horários', 'Seg–Sáb, 7h–19h']].map(([label, value]) => <div key={label}><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 text-sm text-text-primary">{value}</dd></div>)}</dl><p className="mt-5 text-xs text-text-secondary">Informações fictícias para demonstração da tela.</p></article>}
      </section>
    </div>
  );
}
