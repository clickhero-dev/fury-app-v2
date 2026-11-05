import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { MarkdownContent } from '@/components/MarkdownContent';

type Faq = { title: string; slug: string; markdown: string; canonicalSlug?: string };
export function FaqPublicPage() {
  const { slug = '' } = useParams(); const navigate = useNavigate(); const [faq, setFaq] = useState<Faq | null>(null); const [missing, setMissing] = useState(false);
  useEffect(() => { api.get(`/faqs/${slug}`).then((r) => { const item = r.data.data as Faq; if (item.canonicalSlug) navigate(`/ajuda/${item.canonicalSlug}`, { replace: true }); else setFaq(item); }).catch(() => setMissing(true)); }, [slug, navigate]);
  if (missing) return <main className="mx-auto max-w-3xl p-10"><h1>FAQ não encontrada</h1><Link to="/ajuda">Voltar à central</Link></main>;
  if (!faq) return <main className="mx-auto max-w-3xl p-10">Carregando...</main>;
  return <main className="min-h-screen bg-slate-50"><div className="mx-auto max-w-3xl bg-white px-6 py-14"><Link to="/ajuda" className="text-sm text-sky-700">← Central de ajuda</Link><h1 className="mt-6 mb-10 text-4xl font-bold">{faq.title}</h1><MarkdownContent markdown={faq.markdown} /></div></main>;
}
