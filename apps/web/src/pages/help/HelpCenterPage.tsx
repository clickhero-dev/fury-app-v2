import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';

type Faq = { id: string; title: string; slug: string; updatedAt: string };
export function HelpCenterPage() {
  const [params, setParams] = useSearchParams(); const [items, setItems] = useState<Faq[]>([]); const [loading, setLoading] = useState(true);
  const q = params.get('q') ?? '';
  useEffect(() => { setLoading(true); api.get('/faqs', { params: q ? { q } : {} }).then((r) => setItems(r.data.data)).finally(() => setLoading(false)); }, [q]);
  return <main className="min-h-screen bg-slate-50 text-slate-900"><div className="mx-auto max-w-3xl px-6 py-16">
    <Link to="/login" className="text-sm text-sky-700">← Voltar para Ady</Link><h1 className="mt-6 text-4xl font-bold">Central de ajuda</h1><p className="mt-2 text-slate-600">Encontre respostas para usar a plataforma.</p>
    <input aria-label="Pesquisar FAQs" className="mt-8 w-full rounded-lg border p-3" value={q} placeholder="Pesquisar ajuda" onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} />
    <section className="mt-8 space-y-3">{loading ? <p>Carregando...</p> : items.length ? items.map((faq) => <Link className="block rounded-lg border bg-white p-5 hover:border-sky-500" key={faq.id} to={`/ajuda/${faq.slug}`}><h2 className="font-semibold">{faq.title}</h2></Link>) : <p>Nenhuma FAQ encontrada.</p>}</section>
  </div></main>;
}
