import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { homeActions } from '../chat/quick-actions';

export function HomePage() {
  return <AppLayout>
    <div className="mx-auto max-w-4xl pb-24 pt-4 md:pt-10">
      <p className="mb-3 text-sm font-semibold text-brand">Vamos dar o próximo passo</p>
      <h1 className="text-3xl font-bold tracking-tight text-text-primary md:text-4xl">O que vamos fazer hoje?</h1>
      <p className="mt-4 max-w-2xl text-base text-text-secondary">Escolha o que você precisa. A Ady ajuda você a avançar, uma pergunta por vez.</p>
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {homeActions.map(action => <Link key={action.id} to={`/chat?inicio=${action.id}`}
          aria-labelledby={`home-${action.id}`} aria-describedby={`home-benefit-${action.id}`}
          className="group flex min-h-56 flex-col rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-brand hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
          <action.icon className="mb-5 h-7 w-7 text-brand" aria-hidden="true" />
          <h2 id={`home-${action.id}`} className="text-xl font-semibold text-text-primary">{action.label}</h2>
          <p id={`home-benefit-${action.id}`} className="mb-5 mt-2 text-sm leading-relaxed text-text-secondary">{action.benefit}</p>
          <span className="mt-auto flex items-center gap-2 text-sm font-semibold text-brand">Começar com a Ady <ArrowRight size={18} aria-hidden="true" /></span>
        </Link>)}
      </div>
      <p className="mt-6 text-sm leading-relaxed text-text-secondary">Ainda não conectou suas redes ou contou sobre seu negócio? A Ady orienta o próximo passo. As opções disponíveis dependem do seu plano e das permissões da sua conta.</p>
      <p className="mt-3 text-sm text-text-secondary">Você revisa e confirma antes de gerar com custo, publicar, agendar ou criar uma campanha.</p>
    </div>
  </AppLayout>;
}
