import { useEffect, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { useCreateCampaign } from '../hooks/useCreateCampaign';
import type { CreateWizardCampaignPayload, WizardState } from '../types';

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
}

interface AudienceDefaults {
  city?: string;
  cityKey?: string;
  ageMin?: number;
  ageMax?: number;
  gender?: 'all' | 'male' | 'female';
}

export function Step5Review({ state, onViewCampaigns, onCreateAnother, onBack }: Step5ReviewProps) {
  const mutation = useCreateCampaign();
  const [audience, setAudience] = useState<AudienceDefaults>({});
  const [audienceLoading, setAudienceLoading] = useState(true);
  const [showSlowWarning, setShowSlowWarning] = useState(false);

  useEffect(() => {
    api.get<{ success: boolean; data: { audienceDefaults?: AudienceDefaults } }>('/auth/me')
      .then((res) => {
        const defaults = res.data.data?.audienceDefaults;
        if (defaults?.city) {
          setAudience(defaults);
        }
      })
      .catch(() => {
        // silently ignore — audience stays empty
      })
      .finally(() => setAudienceLoading(false));
  }, []);

  // Mostra alerta se a publicação demorar mais que 15s
  useEffect(() => {
    if (mutation.isPending) {
      setShowSlowWarning(false); // reseta ao iniciar
      const timer = setTimeout(() => setShowSlowWarning(true), 15_000);
      return () => clearTimeout(timer);
    } else {
      setShowSlowWarning(false);
    }
  }, [mutation.isPending]);

  const isInstagramCreative = Boolean(state.creative.instagramMediaId);
  const imageUrl = isInstagramCreative
    ? state.creative.mediaUrl
    : state.creative.uploadUrl || state.creative.assetUrl;
  const creativeSourceLabel = isInstagramCreative ? 'Post do Instagram' : 'Galeria do Estúdio';
  const objectiveLabel = state.objective ? OBJECTIVE_LABELS[state.objective] : '';
  const total =
    state.budget.durationDays !== undefined
      ? state.budget.dailyBudgetBrl * state.budget.durationDays
      : null;

  function handlePublish() {
    if (!state.objective) return;

    const payload: CreateWizardCampaignPayload = {
      objective: state.objective,
      creative_asset_id: state.creative.assetId,
      creative_upload_url: state.creative.uploadUrl,
      creative_instagram_media_id: state.creative.instagramMediaId,
      creative_media_url: state.creative.instagramMediaId ? state.creative.mediaUrl : undefined,
      headline: state.creative.headline,
      primary_text: state.creative.primaryText,
      destination_url: state.creative.destinationUrl,
      location_city: audience.city || '',
      location_city_key: audience.cityKey,
      age_min: audience.ageMin || 18,
      age_max: audience.ageMax || 65,
      gender: audience.gender || 'all',
      daily_budget_brl: state.budget.dailyBudgetBrl,
      duration_days: state.budget.durationDays,
      ...(state.objective === 'whatsapp'
        ? {
            whatsapp_page_id: state.whatsapp.pageId,
            whatsapp_page_name: state.whatsapp.pageName,
            whatsapp_phone_number_id: state.whatsapp.phoneNumberId,
            whatsapp_phone_number: state.whatsapp.phoneNumberDisplay,
            destinations: state.whatsapp.destinations,
            instagram_user_id: state.whatsapp.instagramUserId,
            instagram_username: state.whatsapp.instagramUsername,
          }
        : {}),
    };

    mutation.mutate(payload);
  }

  if (mutation.isSuccess) {
    return (
      <div className="flex flex-col items-center text-center py-8 space-y-4">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <div>
          <h3 className="text-lg font-bold text-gray-900">Campanha publicada com sucesso!</h3>
          <p className="text-sm text-gray-500 mt-1">Sua campanha já está ativa no Meta Ads.</p>
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
        <h3 className="text-lg font-bold text-gray-900">Revisão e Publicação</h3>
        <p className="text-sm text-gray-500 mt-1">Confira os detalhes antes de publicar sua campanha.</p>
      </div>

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="p-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Objetivo</div>
          <div className="text-sm font-medium text-gray-900">{objectiveLabel}</div>
        </div>

        {state.objective === 'whatsapp' && (
          <div className="p-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
              Destino das mensagens
            </div>
            <div className="text-sm font-medium text-gray-900">{state.whatsapp.pageName}</div>
            <div className="text-xs text-gray-500 mt-1 space-y-0.5">
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

        <div className="p-4 flex gap-3">
          <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
            {imageUrl ? (
              <img src={imageUrl} alt="Criativo" className="w-full h-full object-cover" />
            ) : (
              <ImagePlus className="w-6 h-6 text-gray-300" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
              Criativo · {creativeSourceLabel}
            </div>
            <div className="text-sm font-medium text-gray-900 truncate">{state.creative.headline}</div>
            <div className="text-xs text-gray-500 mt-1 line-clamp-2">{state.creative.primaryText}</div>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Público</div>
          {audienceLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Carregando...
            </div>
          ) : audience.city ? (
            <>
              <div className="text-sm font-medium text-gray-900">{audience.city}</div>
              <div className="text-xs text-gray-500 mt-1">
                {audience.ageMin || 18}-{audience.ageMax || 65} anos •{' '}
                {GENDER_LABELS[audience.gender || 'all']}
              </div>
            </>
          ) : (
            <div className="text-sm text-amber-700">
              ⚠️ Público não configurado. Vá em Configurações → Público.
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Orçamento</div>
          <div className="text-sm font-medium text-gray-900">
            R$ {state.budget.dailyBudgetBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/dia
            {state.budget.durationDays !== undefined && ` • ${state.budget.durationDays} dias`}
          </div>
          {total !== null && (
            <div className="text-xs text-gray-500 mt-1">
              Total estimado: R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
      </div>

      {showSlowWarning && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Isso pode demorar um pouco mais — estamos enviando sua imagem para o Meta Ads. Aguarde na página.
          </span>
        </div>
      )}

      {mutation.isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
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
          disabled={mutation.isPending || audienceLoading || !audience.city}
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
