import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreateCampaign } from '../hooks/useCreateCampaign';
import { buildWizardCampaignPayload } from '../lib/buildPayload';
import type { WizardState } from '../types';

const OBJECTIVE_LABELS: Record<NonNullable<WizardState['objective']>, string> = {
  visits: 'Visitas',
  engagement: 'Engajamento',
  messages: 'Atração de Clientes',
  whatsapp: 'Conversas no WhatsApp',
  whatsapp_conv: 'Conversas WhatsApp',
};

const GENDER_LABELS: Record<WizardState['audience']['gender'], string> = {
  all: 'Todos os gêneros',
  male: 'Homens',
  female: 'Mulheres',
};

interface Step5ReviewProps {
  state: WizardState;
  onViewCampaigns: () => void;
  onCreateAnother: () => void;
  onBack: () => void;
  onEditField: (step: WizardState['currentStep']) => void;
}

export function Step5Review({ state, onViewCampaigns, onCreateAnother, onBack, onEditField }: Step5ReviewProps) {
  const mutation = useCreateCampaign();
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const slowWarningTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const audience = state.audience;

  // Limpa o timer ao desmontar
  useEffect(() => {
    return () => { if (slowWarningTimer.current) clearTimeout(slowWarningTimer.current); };
  }, []);

  const objectiveLabel = state.objective ? OBJECTIVE_LABELS[state.objective] : '';
  const total =
    state.budget.durationDays !== undefined
      ? state.budget.dailyBudgetBrl * state.budget.durationDays
      : null;

  function handlePublish() {
    if (!state.objective) return;

    const payload = buildWizardCampaignPayload(state);

    setShowSlowWarning(false);
    if (slowWarningTimer.current) clearTimeout(slowWarningTimer.current);
    slowWarningTimer.current = setTimeout(() => setShowSlowWarning(true), 15_000);
    mutation.mutate(payload, {
      onSettled: () => {
        setShowSlowWarning(false);
        if (slowWarningTimer.current) clearTimeout(slowWarningTimer.current);
      },
    });
  }

  if (mutation.isSuccess) {
    return (
      <div className="flex flex-col items-center text-center py-8 space-y-4">
        <CheckCircle2 className="w-16 h-16 text-success" />
        <div>
          <h3 className="text-lg font-bold text-text-primary">Campanha publicada com sucesso!</h3>
          <p className="text-sm text-text-secondary mt-1">Sua campanha já está ativa no Meta Ads.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full pt-2">
          <Button variant="outline" className="flex-1" onClick={onCreateAnother}>
            Criar outra campanha
          </Button>
          <Button variant="primary" className="flex-1" onClick={onViewCampaigns}>
            Ver campanhas
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-text-primary">Revisão e Publicação</h3>
        <p className="text-sm text-text-secondary mt-1">Confira os detalhes antes de publicar sua campanha.</p>
      </div>

      <div className="rounded-xl border border-border divide-y divide-border/60">
        <div className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Objetivo</div>
            <button
              type="button"
              onClick={() => onEditField(1)}
              className="text-text-tertiary hover:text-text-secondary transition-colors"
              title="Editar objetivo"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
          <div className="text-sm font-medium text-text-primary">{objectiveLabel}</div>
        </div>

        {state.objective === 'whatsapp' && (
          <div className="p-4">
            <div className="text-xs font-bold text-text-tertiary uppercase tracking-wide mb-1">
              Destino das mensagens
            </div>
            <div className="text-sm font-medium text-text-primary">{state.whatsapp.pageName}</div>
            <div className="text-xs text-text-secondary mt-1 space-y-0.5">
              {state.whatsapp.destinations.includes('whatsapp') && (
                <div>WhatsApp: {state.whatsapp.phoneNumberDisplay}</div>
              )}
              {state.whatsapp.destinations.includes('instagram_direct') && (
                <div>Instagram: @{state.whatsapp.instagramUsername}</div>
              )}
              {state.whatsapp.destinations.includes('messenger') && (
                <div>Facebook da Página {state.whatsapp.pageName}</div>
              )}
            </div>
          </div>
        )}

        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-text-tertiary uppercase tracking-wide">
              Criativos ({state.creatives.length})
            </div>
            <button
              type="button"
              onClick={() => onEditField(2)}
              className="text-text-tertiary hover:text-text-secondary transition-colors"
              title="Editar criativos"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {state.creatives.map((creative, index) => {
              const isInstagramCreative = Boolean(creative.instagramMediaId);
              const imageUrl = isInstagramCreative
                ? creative.mediaUrl
                : creative.uploadUrl || creative.assetUrl;
              const creativeSourceLabel = isInstagramCreative ? 'Post do Instagram' : 'Galeria do Estúdio';
              return (
                <div key={creative.id} className="flex gap-3">
                  <div className="w-16 h-16 rounded-lg bg-surface-secondary overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {imageUrl ? (
                      <img src={imageUrl} alt={`Criativo ${index + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlus className="w-6 h-6 text-text-tertiary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-text-tertiary uppercase tracking-wide">
                      Criativo {index + 1} · {creativeSourceLabel}
                    </div>
                    <div className="text-sm font-medium text-text-primary truncate">{creative.headline}</div>
                    <div className="text-xs text-text-secondary mt-0.5 line-clamp-2">{creative.primaryText}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Público</div>
            <button
              type="button"
              onClick={() => onEditField(3)}
              className="text-text-tertiary hover:text-text-secondary transition-colors"
              title="Editar público"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
          {audience.city ? (
            <>
              <div className="text-sm font-medium text-text-primary">{audience.city}</div>
              <div className="text-xs text-text-secondary mt-1">
                {audience.ageMin || 18}-{audience.ageMax || 65} anos •{' '}
                {GENDER_LABELS[audience.gender || 'all']}
              </div>
              {audience.audienceInterests && audience.audienceInterests.length > 0 && (
                <div className="text-xs text-text-secondary mt-1">
                  Interesses: {audience.audienceInterests.map(i => i.name).join(', ')}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-warning">
              ⚠️ Público não configurado. Configure no passo anterior.
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Orçamento</div>
            <button
              type="button"
              onClick={() => onEditField(4)}
              className="text-text-tertiary hover:text-text-secondary transition-colors"
              title="Editar orçamento"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
          <div className="text-sm font-medium text-text-primary">
            R$ {state.budget.dailyBudgetBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/dia
            {state.budget.durationDays !== undefined && ` • ${state.budget.durationDays} dias`}
          </div>
          {total !== null && (
            <div className="text-xs text-text-secondary mt-1">
              Total estimado: R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
      </div>

      {showSlowWarning && (
        <div className="rounded-lg bg-warning/10 border border-warning/25 p-3 text-sm text-warning flex items-start gap-2">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Isso pode demorar um pouco mais — estamos enviando sua imagem para o Meta Ads. Aguarde na página.
          </span>
        </div>
      )}

      {mutation.isError && (
        <div className="rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
          {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
            ?.message || 'Erro ao publicar no Meta. Tente novamente.'}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={onBack}
          disabled={mutation.isPending}
        >
          Voltar
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={handlePublish}
          disabled={mutation.isPending || !audience.city}
        >
          {mutation.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Publicando...
            </span>
          ) : (
            'Publicar Campanha'
          )}
        </Button>
      </div>
    </div>
  );
}
