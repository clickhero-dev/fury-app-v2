import { useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/select';
import { useMetaPageWhatsappNumbers } from '../hooks/useMetaPages';
import { useMetaAssetSelection } from '../hooks/useMetaAssetSelection';
import { useBrandKit } from '@/hooks/useBrandKit';
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
    value: 'whatsapp_conv',
    emoji: '💬',
    title: 'Conversas WhatsApp',
    description: 'Direcione clientes para uma página personalizada com botão de WhatsApp.',
  },
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
  const {
    numbers,
    isLoading: isLoadingNumbers,
    isError: isNumbersError,
    isLoaded: numbersLoaded,
  } = useMetaPageWhatsappNumbers(whatsapp.hasWhatsApp ? whatsapp.pageId : undefined);

  const pageHasNoWhatsapp =
    Boolean(whatsapp.pageId) && whatsapp.hasWhatsApp && numbersLoaded && numbers.length === 0;

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

  function handleSelectNumber(phoneNumberId: string) {
    const number = numbers.find((n) => n.phoneNumberId === phoneNumberId);
    onWhatsappChange({
      phoneNumberId: phoneNumberId || undefined,
      phoneNumberDisplay: number?.displayPhoneNumber,
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

      {whatsapp.pageId && (
        <div>
          {mode === 'destinations' && (
            <label className="text-sm font-bold text-text-primary mb-2 block">Onde quer receber as mensagens?</label>
          )}
          {mode === 'destinations' && onlyMessengerAvailable && (
            <p className="text-xs text-warning mb-2">
              Este negócio só tem Facebook disponível. Para usar WhatsApp, vincule um número WABA. Para usar Instagram, conecte sua conta Instagram à Página no Meta Business.
            </p>
          )}
          {mode === 'whatsapp_only' ? (
            <BrandKitPhoneField whatsapp={whatsapp} onWhatsappChange={onWhatsappChange} />
          ) : (
          <div className="space-y-3">
            {whatsapp.hasWhatsApp && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsapp.destinations.includes('whatsapp')}
                    onChange={() => toggleDestination('whatsapp')}
                    className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
                  />
                  WhatsApp
                </label>
                <p className="text-xs text-text-secondary ml-6">As pessoas vão te chamar pelo WhatsApp</p>
                {whatsapp.destinations.includes('whatsapp') && (
                  <div className="mt-2 ml-6">
                    <div className="relative">
                      <Select
                        value={whatsapp.phoneNumberId ?? ''}
                        onChange={(e) => handleSelectNumber(e.target.value)}
                        disabled={isLoadingNumbers || pageHasNoWhatsapp}
                      >
                        <option value="">
                          {isLoadingNumbers ? 'Carregando números...' : 'Selecione o número'}
                        </option>
                        {numbers.map((number) => (
                          <option key={number.phoneNumberId} value={number.phoneNumberId}>
                            {number.displayPhoneNumber}
                            {number.verifiedName ? ` — ${number.verifiedName}` : ''}
                          </option>
                        ))}
                      </Select>
                      {isLoadingNumbers && (
                        <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary animate-spin" />
                      )}
                    </div>
                    {pageHasNoWhatsapp && (
                      <p className="text-xs text-warning mt-1">
                        Esta página não tem número de WhatsApp vinculado. Vincule um número no Meta Business.
                      </p>
                    )}
                    {isNumbersError && (
                      <p className="text-xs text-error mt-1">
                        Não foi possível carregar os números de WhatsApp desta página. Tente novamente.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {whatsapp.hasInstagram && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsapp.destinations.includes('instagram_direct')}
                    onChange={() => toggleDestination('instagram_direct')}
                    className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
                  />
                  Instagram
                </label>
                <p className="text-xs text-text-secondary ml-6">As pessoas vão te chamar pelo Instagram</p>
                {whatsapp.destinations.includes('instagram_direct') && (
                  <div className="mt-1 ml-6 text-sm text-text-secondary">@{whatsapp.instagramUsername}</div>
                )}
              </div>
            )}

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={whatsapp.destinations.includes('messenger')}
                  onChange={() => toggleDestination('messenger')}
                  className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
                />
                Facebook
              </label>
              <p className="text-xs text-text-secondary ml-6">As pessoas vão te chamar pelo Facebook</p>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Campo de telefone do Brand Kit (objetivo 'leads') ────────────────────────

const PHONE_FMT = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9, 13)}`;
};

/**
 * Telefone que recebe o cliente no fim do formulário de leads. O botão WhatsApp
 * do thank-you page NÃO exige WABA vinculado — é um telefone comercial comum —
 * então usamos o número cadastrado em Configurações → Brand Kit como padrão,
 * editável aqui. A existência do WhatsApp no número é validada pela Meta na
 * hora de criar o formulário (erro 192 → mensagem amigável).
 */
function BrandKitPhoneField({
  whatsapp,
  onWhatsappChange,
}: {
  whatsapp: WizardWhatsappState;
  onWhatsappChange: (updates: Partial<WizardWhatsappState>) => void;
}) {
  const { brandKit, isLoading: isLoadingBrandKit } = useBrandKit();
  const brandKitDigits = brandKit?.whatsapp_number?.replace(/\D/g, '') ?? '';

  // Pre-preenche uma unica vez com o numero do Brand Kit (usuario pode editar).
  useEffect(() => {
    if (!isLoadingBrandKit && brandKitDigits && !whatsapp.phoneNumberDisplay) {
      onWhatsappChange({ phoneNumberDisplay: brandKitDigits });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingBrandKit, brandKitDigits]);

  const digits = whatsapp.phoneNumberDisplay?.replace(/\D/g, '') ?? '';
  const isValid = digits.length >= 12 && digits.startsWith('55');

  return (
    <div>
      <label className="text-sm font-bold text-text-primary mb-1 block">WhatsApp que vai atender</label>
      <input
        type="text"
        inputMode="tel"
        value={whatsapp.phoneNumberDisplay ? PHONE_FMT(whatsapp.phoneNumberDisplay) : ''}
        onChange={(e) => onWhatsappChange({ phoneNumberDisplay: e.target.value.replace(/\D/g, '') })}
        placeholder={isLoadingBrandKit ? 'Carregando número do Brand Kit...' : '+55 (11) 99999-9999'}
        className="w-full px-4 py-3 border border-border rounded-lg bg-surface text-text-primary placeholder-text-tertiary transition-all focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {digits.length > 0 && !isValid && (
        <p className="text-xs text-warning mt-1">
          Informe o número com DDI (55) + DDD + número, ex.: 5511999999999.
        </p>
      )}
      {digits.length > 0 && isValid && (
        <p className="text-xs text-text-secondary mt-1">
          No fim do formulário, o botão &quot;Falar no WhatsApp&quot; abre uma conversa com este número. O Meta valida
          se o número tem WhatsApp ativo ao publicar a campanha.
        </p>
      )}
    </div>
  );
}
