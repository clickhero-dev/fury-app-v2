import { ArrowRight, BarChart3, Plus } from 'lucide-react';

interface CampaignEntryChoiceProps {
  onCreate: () => void;
  onView: () => void;
}

export function CampaignEntryChoice({ onCreate, onView }: CampaignEntryChoiceProps) {
  return (
    <section aria-labelledby="campaign-entry-title" className="space-y-5">
      <div>
        <h2 id="campaign-entry-title" className="text-2xl font-bold text-text-primary">
          O que você quer fazer?
        </h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-text-secondary">
          Crie uma nova campanha ou acompanhe os anúncios que já estão rodando.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onCreate}
          className="group rounded-2xl border-2 border-brand bg-brand/10 p-5 text-left transition-colors duration-200 hover:bg-brand/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
            <Plus aria-hidden="true" className="h-6 w-6" />
          </span>
          <span className="mt-5 block text-lg font-bold text-text-primary">Criar campanha</span>
          <span className="mt-1 block text-sm leading-5 text-text-secondary">
            Escolha onde anunciar e monte sua próxima campanha.
          </span>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand">
            Começar agora <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={onView}
          className="group rounded-2xl border border-border bg-surface p-5 text-left transition-colors duration-200 hover:border-brand/50 hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-secondary text-brand">
            <BarChart3 aria-hidden="true" className="h-6 w-6" />
          </span>
          <span className="mt-5 block text-lg font-bold text-text-primary">Ver campanhas</span>
          <span className="mt-1 block text-sm leading-5 text-text-secondary">
            Consulte resultados, status e desempenho dos seus anúncios.
          </span>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
            Abrir painel <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>
    </section>
  );
}
