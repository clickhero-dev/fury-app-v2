import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import type { GoogleConnection, GoogleBusinessSettings } from '@/types/google';

interface GoogleApiResponse<T> {
  success: boolean;
  data: T;
}

type LocationLevel = 'city' | 'state' | 'country';

interface GoogleAdsCampaignPayload {
  customerId: string;
  objective: 'leads' | 'website' | 'calls';
  locationLevel: LocationLevel;
  locationValue: string;
  headlines: string[];
  longHeadline: string;
  descriptions: string[];
  destinationUrl: string;
  dailyBudgetBrl: number;
  imageUrls: string[];
}

function getApiErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('response' in error)) return null;

  const response = (error as { response?: { data?: { error?: { code?: unknown } } } }).response;
  return typeof response?.data?.error?.code === 'string' ? response.data.error.code : null;
}

export function GoogleAdsCampaignPage({ onBack }: { onBack?: () => void }) {
  const [customerId, setCustomerId] = useState('');
  const [objective, setObjective] = useState<GoogleAdsCampaignPayload['objective']>('leads');
  const [locationLevel, setLocationLevel] = useState<LocationLevel>('city');
  const [headlines, setHeadlines] = useState(['', '', '']);
  const [longHeadline, setLongHeadline] = useState('');
  const [descriptions, setDescriptions] = useState(['', '']);
  const [destinationUrl, setDestinationUrl] = useState('');
  const [dailyBudgetBrl, setDailyBudgetBrl] = useState('20');
  const [imageUrls, setImageUrls] = useState(['', '']);
  const [idempotencyKey] = useState(() => globalThis.crypto?.randomUUID?.() ?? `google-ads-${Date.now()}-${Math.random()}`);
  const [message, setMessage] = useState<string | null>(null);

  const connectionQuery = useQuery<GoogleConnection | null>({
    queryKey: ['google-connection'],
    queryFn: async () => (await api.get<GoogleApiResponse<GoogleConnection | null>>('/google/connections')).data.data,
    retry: false,
  });

  const settingsQuery = useQuery<GoogleBusinessSettings | null>({
    queryKey: ['google-settings'],
    queryFn: async () => (await api.get<GoogleApiResponse<GoogleBusinessSettings | null>>('/google/settings')).data.data,
    enabled: !!connectionQuery.data,
    retry: false,
  });

  const accountsQuery = useQuery<string[]>({
    queryKey: ['google-ads-accounts'],
    queryFn: async () => (await api.get<GoogleApiResponse<string[]>>('/google-ads/accounts')).data.data,
    enabled: !!connectionQuery.data,
    retry: false,
  });

  const selectCustomerMutation = useMutation({
    mutationFn: async (selectedCustomerId: string) => {
      await api.put('/google-ads/accounts/selected', { customerId: selectedCustomerId });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get<GoogleApiResponse<{ authUrl: string }>>('/google/auth/url', {
        params: { context: 'ads', frontendUrl: window.location.origin },
      });
      return response.data.data.authUrl;
    },
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: GoogleAdsCampaignPayload) => {
      const response = await api.post<GoogleApiResponse<{ campaignId: string; status: string }>>(
        '/google-ads/campaigns',
        payload,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
      return response.data.data;
    },
    onSuccess: (result) => {
      setMessage(`Campanha criada e ativada. Código: ${result.campaignId}`);
    },
    onError: () => {
      setMessage('Não foi possível criar a campanha. Verifique a conta Google Ads e as permissões concedidas.');
    },
  });

  const settings = settingsQuery.data;
  const locationOptions = useMemo(() => {
    if (!settings) return [];
    return [
      { value: 'city' as const, label: `Cidade: ${settings.address.city}` },
      { value: 'state' as const, label: `Estado: ${settings.address.state}` },
      { value: 'country' as const, label: `País: ${settings.address.country}` },
    ];
  }, [settings]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    createMutation.mutate({
      customerId: customerId || accountsQuery.data?.[0] || '',
      objective,
      locationLevel,
      locationValue: settings?.address[locationLevel] ?? '',
      headlines,
      longHeadline,
      descriptions,
      destinationUrl,
      dailyBudgetBrl: Number(dailyBudgetBrl),
      imageUrls,
    });
  }

  if (connectionQuery.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>;
  }

  if (!connectionQuery.data) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <h2 className="text-lg font-bold text-text-primary">Conecte o Google para criar anúncios</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Precisamos acessar seu Perfil da Empresa e sua conta Google Ads para criar a campanha.
        </p>
        <button
          type="button"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          className="mt-5 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {connectMutation.isPending ? 'Abrindo Google...' : 'Conectar Google Ads'}
        </button>
      </div>
    );
  }

  if (settingsQuery.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>;
  }

  if (accountsQuery.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>;
  }

  const accountsErrorCode = getApiErrorCode(accountsQuery.error);
  if (accountsErrorCode === 'GOOGLE_ADS_NOT_CONFIGURED') {
    return (
      <div role="alert" className="rounded-2xl border border-warning/30 bg-warning/10 p-6 text-center">
        <h2 className="text-lg font-bold text-text-primary">Google Ads ainda não está configurado neste ambiente</h2>
        <p className="mt-2 text-sm text-text-secondary">
          A equipe precisa concluir a configuração do Google Ads antes de listar contas ou publicar campanhas.
        </p>
        <a href="/configuracoes/integracoes" className="mt-5 inline-flex rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white">
          Ver integrações
        </a>
      </div>
    );
  }

  if (accountsQuery.isError) {
    return (
      <div role="alert" className="rounded-2xl border border-warning/30 bg-warning/10 p-6 text-center">
        <h2 className="text-lg font-bold text-text-primary">Não foi possível carregar suas contas Google Ads</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Verifique a conexão e as permissões do Google antes de tentar criar uma campanha.
        </p>
        <a href="/configuracoes/integracoes" className="mt-5 inline-flex rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white">
          Ver integrações
        </a>
      </div>
    );
  }

  if ((accountsQuery.data?.length ?? 0) === 0) {
    return (
      <div role="alert" className="rounded-2xl border border-warning/30 bg-warning/10 p-6 text-center">
        <h2 className="text-lg font-bold text-text-primary">Não encontramos contas Google Ads acessíveis</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Verifique se esta conta Google tem acesso a uma conta Google Ads e tente conectar novamente.
        </p>
        <a href="/configuracoes/integracoes" className="mt-5 inline-flex rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white">
          Ver integrações
        </a>
      </div>
    );
  }

  if (!settings) {
    return (
      <div role="alert" className="rounded-2xl border border-warning/30 bg-warning/10 p-6 text-center">
        <h2 className="text-lg font-bold text-text-primary">Configure seu Perfil da Empresa</h2>
        <p className="mt-2 text-sm text-text-secondary">Crie ou conecte um Perfil da Empresa Google antes de anunciar.</p>
        <a href="/configuracoes/google-meu-negocio" className="mt-5 inline-flex rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white">
          Configurar Perfil da Empresa
        </a>
      </div>
    );
  }

  const hasConfiguredLocation = Boolean(
    settings.address.city && settings.address.state && settings.address.country,
  );
  if (!hasConfiguredLocation) {
    return (
      <div role="alert" className="rounded-2xl border border-warning/30 bg-warning/10 p-6 text-center">
        <h2 className="text-lg font-bold text-text-primary">Configure seu Perfil da Empresa</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Informe cidade, estado e país do seu negócio antes de criar uma campanha Google.
        </p>
        <a href="/configuracoes/google-meu-negocio" className="mt-5 inline-flex rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white">
          Configurar Perfil da Empresa
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-surface p-6">
      {onBack && (
        <button type="button" onClick={onBack} className="text-sm font-semibold text-text-secondary hover:text-text-primary">
          ← Voltar
        </button>
      )}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-bold text-text-primary">Criar campanha no Google</h2>
        </div>
        <p className="mt-1 text-sm text-text-secondary">Performance Max para alcançar clientes na área do seu negócio.</p>
      </div>

      <label className="block text-sm font-medium text-text-primary">
        Conta Google Ads
        <select
          required
          value={customerId || accountsQuery.data?.[0] || ''}
          onChange={(event) => {
            setCustomerId(event.target.value);
            if (event.target.value) selectCustomerMutation.mutate(event.target.value);
          }}
          className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2"
        >
          <option value="">Selecione uma conta</option>
          {(accountsQuery.data ?? []).map((accountId) => (
            <option key={accountId} value={accountId}>{accountId}</option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-text-primary">
        Objetivo
        <select value={objective} onChange={(event) => setObjective(event.target.value as GoogleAdsCampaignPayload['objective'])} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2">
          <option value="leads">Receber contatos</option>
          <option value="website">Receber visitas no site</option>
          <option value="calls">Receber ligações</option>
        </select>
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-text-primary">Onde anunciar</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {locationOptions.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-text-primary">
              <input type="radio" name="location-level" value={option.value} checked={locationLevel === option.value} onChange={() => setLocationLevel(option.value)} />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {headlines.map((value, index) => (
        <label key={`headline-${index}`} className="block text-sm font-medium text-text-primary">
          Título do anúncio {index + 1}
          <input required maxLength={30} value={value} onChange={(event) => setHeadlines((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2" placeholder="Ex.: Encontre a solução ideal" />
        </label>
      ))}

      <label className="block text-sm font-medium text-text-primary">
        Título longo
        <input required maxLength={90} value={longHeadline} onChange={(event) => setLongHeadline(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2" placeholder="Ex.: A solução ideal para sua empresa" />
      </label>

      {descriptions.map((value, index) => (
        <label key={`description-${index}`} className="block text-sm font-medium text-text-primary">
          Descrição {index + 1}
          <textarea required maxLength={90} value={value} onChange={(event) => setDescriptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="mt-1 min-h-24 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2" placeholder="Explique por que o cliente deve escolher sua empresa." />
        </label>
      ))}

      <label className="block text-sm font-medium text-text-primary">
        Site de destino
        <input required type="url" value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2" placeholder="https://suaempresa.com.br" />
      </label>

      <label className="block text-sm font-medium text-text-primary">
        Orçamento diário (R$)
        <input required min="1" step="0.01" type="number" value={dailyBudgetBrl} onChange={(event) => setDailyBudgetBrl(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2" />
      </label>

      {imageUrls.map((value, index) => (
        <label key={`image-${index}`} className="block text-sm font-medium text-text-primary">
          {index === 0 ? 'Imagem paisagem (1,91:1)' : 'Imagem quadrada (1:1)'}
          <input required type="url" value={value} onChange={(event) => setImageUrls((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2" placeholder="https://..." />
        </label>
      ))}

      {message && <p role="alert" className="rounded-xl border border-brand/30 bg-brand/10 p-3 text-sm text-text-primary">{message}</p>}

      <button type="submit" disabled={createMutation.isPending} className="w-full rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {createMutation.isPending ? 'Criando campanha...' : 'Criar e ativar campanha'}
      </button>
    </form>
  );
}
