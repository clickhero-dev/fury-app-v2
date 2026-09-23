import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ImagePlus, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { useCreateCampaign } from '../hooks/useCreateCampaign';
import { buildWizardCampaignPayload } from '../lib/buildPayload';
import { formatPhoneDisplay } from '../lib/phone-format';
import type { WizardState } from '../types';
import { hasGeoLocations } from '../types';

const OBJECTIVE_LABELS: Record<NonNullable<WizardState['objective']>, string> = {
  visits: 'Visitas',
  engagement: 'Engajamento',
  messages: 'Atração de Clientes',
  whatsapp: 'Conversas no WhatsApp',
  whatsapp_conv: 'Conversas WhatsApp',
  leads: 'Formulário de captação',
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

  // Token sem permissão (ex.: pages_manage_ads p/ Formulário) ou expirado:
  // refazer o OAuth concede os scopes atuais e volta para esta tela.
  // rerequest=true → auth_type=rerequest no OAuth: força o Login Dialog a
  // re-exibir permissões já declinadas (sem isso ele omite e o erro volta igual).
  const reconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get<{ data: { authUrl: string } }>('/meta/auth/url', {
        params: { context: 'settings', frontendUrl: window.location.origin, rerequest: 'true' },
      });
      return response.data.data.authUrl;
    },
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
  });

  const publishError = (mutation.error as { response?: { data?: { error?: { code?: string; message?: string; details?: Record<string, unknown> } } } })
    ?.response?.data?.error;
  // Erros de reconexão: token expirado ou falta de permissão no escopo — refazer o
  // OAuth concede os scopes atuais. Erros de Página (META_PAGE_NOT_MANAGED /
  // META_PAGE_ADVERTISE_TASK_REQUIRED) NÃO entram aqui: reconectar não resolve, a
  // mensagem do backend já orienta a trocar de Página / solicitar papel ADVERTISE.
  const isReconnectError =
    publishError?.code === 'META_TOKEN_EXPIRED' || publishError?.code === 'META_PERMISSION_DENIED';

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

        {state.objective === 'leads' && (
          <div className="p-4">
            <div className="text-xs font-bold text-text-tertiary uppercase tracking-wide mb-1">
              Formulário e WhatsApp
            </div>
            <div className="text-sm font-medium text-text-primary">{state.whatsapp.pageName}</div>
            <div className="text-xs text-text-secondary mt-1">
              Coleta nome, e-mail e telefone. No fim, botão abre o WhatsApp {formatPhoneDisplay(state.whatsapp.phoneNumberDisplay ?? '')}.
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
              {hasGeoLocations(audience.geo) && (
                <div className="text-xs text-text-secondary mt-1">
                  {audience.geo.mode === 'cities'
                    ? `Cidades inteiras: ${audience.geo.cities.map((c) => c.name).join(', ')}`
                    : `${audience.geo.points.length} ponto(s): ${audience.geo.points.map((p) => `${p.radiusKm.toLocaleString('pt-BR')} km`).join(', ')}`}
                </div>
              )}
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
        <div className="rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error space-y-3">
          <span className="whitespace-pre-line">{publishError?.message || 'Erro ao publicar no Meta. Tente novamente.'}</span>
          {publishError?.details && (
            <details className="text-xs">
              <summary className="cursor-pointer">Detalhes técnicos</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify({ code: publishError.code, ...publishError.details }, null, 2)}</pre>
            </details>
          )}
          {isReconnectError && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={() => reconnectMutation.mutate()}
              disabled={reconnectMutation.isPending}
            >
              {reconnectMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Redirecionando...
                </span>
              ) : (
                'Reconectar Meta'
              )}
            </Button>
          )}
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
