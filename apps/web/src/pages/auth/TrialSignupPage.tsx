import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdySymbol } from '@/components/AdySymbol';
import api from '@/lib/api';

export function TrialSignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api.post('/public/trial/signup', { name, email, ...(phone ? { phone } : {}) });
    } catch {
      // Mantém a mesma confirmação para não revelar se o email já existe.
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f3f6f8] px-5 py-16 text-slate-900 transition-colors dark:bg-[#0c0d0a] dark:text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(#1E88A8 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      <main className="relative z-10 w-full max-w-md">
        <Link to="/cadastro" className="mb-4 inline-block text-sm font-medium text-[#17708A] dark:text-[#1E88A8]">← Voltar ao cadastro</Link>
        <section className="rounded-2xl border border-slate-200/90 bg-white/95 p-7 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-[#181915]">
          <div className="mb-6 flex flex-col items-center text-center">
            <AdySymbol size={44} />
            <h1 className="mt-4 text-2xl font-semibold">Seu Trial grátis por 7 dias</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Conheça a Ady com acesso gratuito e sem informar cartão.</p>
          </div>
          <ul className="mb-6 space-y-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-white/5 dark:text-zinc-300">
            <li>✓ Até 5 imagens</li>
            <li>✓ Até 3 ajustes por criação</li>
            <li>✓ Vídeos não incluídos</li>
          </ul>
          {sent ? (
            <p role="status" className="rounded-xl bg-[#17708A]/10 p-4 text-center text-sm text-slate-700 dark:text-zinc-200">
              Se os dados forem elegíveis, você receberá instruções por e-mail.
            </p>
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              <label htmlFor="trial-name" className="grid gap-1 text-sm font-medium">Nome
                <input id="trial-name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-white/20" />
              </label>
              <label htmlFor="trial-email" className="grid gap-1 text-sm font-medium">E-mail
                <input id="trial-email" autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-white/20" />
              </label>
              <label htmlFor="trial-phone" className="grid gap-1 text-sm font-medium">Telefone (opcional)
                <input id="trial-phone" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-white/20" />
              </label>
              <button type="submit" disabled={loading} className="rounded-xl bg-[#17708A] py-3 font-semibold text-white transition-colors hover:bg-[#145E74] disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? 'Enviando…' : 'Solicitar Trial'}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
