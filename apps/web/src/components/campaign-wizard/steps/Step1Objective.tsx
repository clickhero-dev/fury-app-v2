import { useEffect, type ReactNode } from 'react';
import { Check, Loader2, Camera, Send } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/select';
import { useMetaAssetSelection } from '../hooks/useMetaAssetSelection';
import { useBrandKit } from '@/hooks/useBrandKit';
import { formatPhoneDisplay, isValidBusinessPhone } from '../lib/phone-format';
import type {
  WizardObjective,
  WizardMessagingDestination,
  WizardWhatsappState,
} from '../types';

interface ObjectiveOption {
  value: WizardObjective;
  emoji: string;
  title: string;
  description: string;
}

const OBJECTIVE_OPTIONS: ObjectiveOption[] = [
  {
    value: 'whatsapp',
    emoji: '📲',
    title: 'Gerar Conversas',
    description: 'Receba mensagens de clientes interessados no Facebook Messenger ou Instagram.',
  },
  {
    value: 'leads',
    emoji: '📋',
    title: 'Formulário de captação',
    description: 'Colete nome, e-mail e telefone dos interessados e leve eles pro seu WhatsApp.',
  },
];

interface Step1ObjectiveProps {
  value: WizardObjective | null;
  onChange: (objective: WizardObjective) => void;
  whatsapp?: WizardWhatsappState;
  onWhatsappChange?: (updates: Partial<WizardWhatsappState>) => void;
}

export function Step1Objective({ value, onChange, whatsapp, onWhatsappChange }: Step1ObjectiveProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-text-primary">Qual o objetivo da sua campanha?</h3>
        <p className="text-sm text-text-secondary mt-1">Escolha o que você mais quer alcançar com este anúncio.</p>
      </div>

      <div className="space-y-3">
        {OBJECTIVE_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-4',
                isSelected
                  ? 'border-brand bg-brand/10'
                  : 'border-border bg-surface hover:border-brand/40'
              )}
            >
              <div className="text-3xl leading-none">{option.emoji}</div>
              <div className="flex-1">
                <div className="font-bold text-text-primary">{option.title}</div>
                <div className="text-sm text-text-secondary mt-1">{option.description}</div>
              </div>
              <div
                className={cn(
                  'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1',
                  isSelected ? 'border-brand bg-brand' : 'border-border'
                )}
              >
                {isSelected && <Check className="w-4 h-4 text-white" />}
              </div>
            </button>
          );
        })}
      </div>

      {value === 'whatsapp' && whatsapp && onWhatsappChange && (
        <MessagingDestinationFields whatsapp={whatsapp} onWhatsappChange={onWhatsappChange} mode="destinations" />
      )}

      {value === 'leads' && whatsapp && onWhatsappChange && (
        <MessagingDestinationFields whatsapp={whatsapp} onWhatsappChange={onWhatsappChange} mode="whatsapp_only" />
      )}
    </div>
  );
}

// ── Messaging destination fields (moved from Step3Audience) ──────────────────

function MessagingDestinationFields({
  whatsapp,
  onWhatsappChange,
  mode = 'destinations',
}: {
  whatsapp: WizardWhatsappState;
  onWhatsappChange: (updates: Partial<WizardWhatsappState>) => void;
  mode?: 'destinations' | 'whatsapp_only';
}) {
  const { data: assetSelection, isLoading: isLoadingPages, isError: isPagesError } = useMetaAssetSelection();
  const pages = assetSelection?.pages ?? [];
  const onlyMessengerAvailable = Boolean(whatsapp.pageId) && !whatsapp.hasWhatsApp && !whatsapp.hasInstagram;

  function handleSelectPage(pageId: string) {
    const page = pages.find((p) => p.pageId === pageId);
    if (!page) {
      onWhatsappChange({
        pageId: undefined, pageName: undefined, hasWhatsApp: undefined,
        hasInstagram: undefined, destinations: [],
        phoneNumberId: undefined, phoneNumberDisplay: undefined,
        instagramUserId: undefined, instagramUsername: undefined,
      });
      return;
    }
    onWhatsappChange({
      pageId: page.pageId, pageName: page.name,
      hasWhatsApp: page.hasWhatsApp, hasInstagram: page.hasInstagram,
      destinations: mode === 'whatsapp_only'
        ? ['whatsapp']
        : page.hasWhatsApp || page.hasInstagram ? [] : ['messenger'],
      phoneNumberId: undefined, phoneNumberDisplay: undefined,
      instagramUserId: page.hasInstagram ? page.instagramUserId ?? undefined : undefined,
      instagramUsername: page.hasInstagram ? page.instagramUsername ?? undefined : undefined,
    });
  }

  function toggleDestination(destination: WizardMessagingDestination) {
    const isSelected = whatsapp.destinations.includes(destination);
    const destinations = isSelected
      ? whatsapp.destinations.filter((d) => d !== destination)
      : [...whatsapp.destinations, destination];
    const updates: Partial<WizardWhatsappState> = { destinations };
    if (destination === 'whatsapp' && isSelected) {
      updates.phoneNumberId = undefined;
      updates.phoneNumberDisplay = undefined;
    }
    onWhatsappChange(updates);
  }

  return (
    <div className="rounded-xl border border-border p-4 space-y-4 bg-surface-secondary/50">
      <div>
        <h4 className="text-sm font-bold text-text-primary">
          {mode === 'whatsapp_only' ? 'Página e WhatsApp' : 'Destino das mensagens'}
        </h4>
        <p className="text-xs text-text-secondary mt-0.5">
          {mode === 'whatsapp_only'
            ? 'Escolha a Página que receberá o formulário e o número do WhatsApp que atenderá os clientes.'
            : 'Escolha onde deseja receber as conversas.'}
        </p>
      </div>

      {isLoadingPages && (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando dados do seu negócio...
        </div>
      )}

      {isPagesError && (
        <p className="text-xs text-error">
          Não foi possível carregar os dados do seu negócio. Verifique a conexão Meta em Configurações → Integrações.
        </p>
      )}

      {!isLoadingPages && !isPagesError && pages.length === 0 && (
        <p className="text-xs text-warning">
          Nenhuma Página selecionada na conexão Meta. Configure em Configurações → Integrações.
        </p>
      )}

      {pages.length > 1 && (
        <div>
          <label className="text-sm font-bold text-text-primary mb-1 block">Qual negócio vai anunciar?</label>
          <Select value={whatsapp.pageId ?? ''} onChange={(e) => handleSelectPage(e.target.value)}>
            <option value="">Selecione</option>
            {pages.map((page) => (
              <option key={page.pageId} value={page.pageId}>{page.name}</option>
            ))}
          </Select>
        </div>
      )}

      {mode === 'whatsapp_only' ? (
        <BrandKitPhoneField whatsapp={whatsapp} onWhatsappChange={onWhatsappChange} />
      ) : whatsapp.pageId && (
        <div>
          {mode === 'destinations' && (
            <>
              <label className="text-sm font-bold text-text-primary mb-1 block">Onde quer receber as mensagens?</label>
              <p className="text-xs text-text-secondary mb-3">Escolha um ou mais canais</p>
            </>
          )}
          {mode === 'destinations' && onlyMessengerAvailable && (
            <p className="text-xs text-warning mb-2">
              Este negócio só tem Facebook disponível. Para usar WhatsApp, vincule um número WABA. Para usar Instagram, conecte sua conta Instagram à Página no Meta Business.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <DestinationCard
              destination="instagram_direct"
              title="Instagram"
              description="Receba mensagens no Direct"
              icon={Camera}
              available={Boolean(whatsapp.hasInstagram)}
              selected={whatsapp.destinations.includes('instagram_direct')}
              onToggle={() => toggleDestination('instagram_direct')}
              unavailableMessage="Conecte sua conta do Instagram à Página no Meta Business."
            >
              {whatsapp.destinations.includes('instagram_direct') && (
                <p className="mt-3 text-xs text-text-secondary">@{whatsapp.instagramUsername}</p>
              )}
            </DestinationCard>

            <DestinationCard
              destination="messenger"
              title="Facebook"
              description="Receba mensagens no Messenger"
              icon={Send}
              available
              selected={whatsapp.destinations.includes('messenger')}
              onToggle={() => toggleDestination('messenger')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DestinationCard({
  destination,
  title,
  description,
  icon: Icon,
  available,
  selected,
  onToggle,
  unavailableMessage,
  children,
}: {
  destination: WizardMessagingDestination;
  title: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
  selected: boolean;
  onToggle: () => void;
  unavailableMessage?: string;
  children?: ReactNode;
}) {
  const inputId = `destination-${destination}`;

  return (
    <div
      data-testid={`message-destination-${destination}`}
      onClick={(event) => {
        if (available && event.target === event.currentTarget) onToggle();
      }}
      className={cn(
        'rounded-xl border p-3 transition-colors',
        selected ? 'border-brand bg-brand/5 ring-1 ring-brand/30' : 'border-border bg-surface',
        !available && 'opacity-60'
      )}
    >
      <label
        htmlFor={inputId}
        onClick={(event) => event.stopPropagation()}
        className={cn('flex items-start gap-3', available ? 'cursor-pointer' : 'cursor-not-allowed')}
      >
        <span className={cn('rounded-lg p-2', selected ? 'bg-brand text-white' : 'bg-surface-secondary text-text-secondary')}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-text-primary">{title}</span>
          <span className="mt-1 block text-xs text-text-secondary">{description}</span>
        </span>
        <input
          id={inputId}
          type="checkbox"
          aria-label={title}
          checked={selected}
          onChange={onToggle}
          disabled={!available}
          className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand"
        />
      </label>
      {!available && unavailableMessage && <p className="mt-3 text-xs text-warning">{unavailableMessage}</p>}
      {children}
    </div>
  );
}

// ── Campo de telefone do Brand Kit (objetivo 'leads') ────────────────────────

/**
 * Telefone que recebe o cliente no fim do formulário de leads. O botão WhatsApp
 * do thank-you page NÃO exige WABA vinculado — é um telefone comercial comum —
 * então usamos o número cadastrado em Configurações → Brand Kit como padrão,
 * editável aqui. A existência do WhatsApp no número é validada pela Meta na
 * hora de criar o formulário (erro 192 → mensagem amigável).
 *
 * Formatação/validação em lib/phone-format.ts — DDD 55 (RS) é válido e NUNCA
 * deve ser interpretado como DDI (caso 55981286344 → (55) 98128-6344).
 */
function BrandKitPhoneField({
  whatsapp,
  onWhatsappChange,
}: {
  whatsapp: WizardWhatsappState;
  onWhatsappChange: (updates: Partial<WizardWhatsappState>) => void;
}) {
  const { brandKit, isLoading: isLoadingBrandKit, isError, refetch } = useBrandKit();
  const brandKitDigits = brandKit?.whatsapp_number?.replace(/\D/g, '') ?? '';

  // Pre-preenche uma unica vez com o numero do Brand Kit (usuario pode editar).
  useEffect(() => {
    if (!isLoadingBrandKit && brandKitDigits && !whatsapp.phoneNumberDisplay) {
      onWhatsappChange({ phoneNumberDisplay: brandKitDigits });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingBrandKit, brandKitDigits]);

  const digits = whatsapp.phoneNumberDisplay?.replace(/\D/g, '') ?? '';
  const valid = isValidBusinessPhone(digits);

  return (
    <div>
      <label htmlFor="brand-kit-whatsapp" className="text-sm font-bold text-text-primary mb-1 block">WhatsApp que vai atender</label>
      {isError && (
        <div className="mb-2 flex items-center gap-2 text-xs text-error">
          <p role="alert">Não foi possível carregar o número do Brand Kit. Preencha-o manualmente ou tente novamente.</p>
          <button type="button" className="underline" onClick={() => void refetch()}>Tentar novamente</button>
        </div>
      )}
      <input
        id="brand-kit-whatsapp"
        type="text"
        inputMode="tel"
        value={formatPhoneDisplay(digits)}
        onChange={(e) => onWhatsappChange({ phoneNumberDisplay: e.target.value.replace(/\D/g, '') })}
        placeholder={isLoadingBrandKit ? 'Carregando número do Brand Kit...' : '(55) 98128-6344 ou +55 (11) 99999-9999'}
        className="w-full px-4 py-3 border border-border rounded-lg bg-surface text-text-primary placeholder-text-tertiary transition-all focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {digits.length > 0 && !valid && (
        <p className="text-xs text-warning mt-1">
          Informe DDD + número (ex.: 55981286344) ou com DDI (ex.: 5511999999999).
        </p>
      )}
      {digits.length > 0 && valid && (
        <p className="text-xs text-text-secondary mt-1">
          No fim do formulário, o botão &quot;Falar no WhatsApp&quot; abre uma conversa com este número. O Meta valida
          se o número tem WhatsApp ativo ao publicar a campanha.
        </p>
      )}
    </div>
  );
}
