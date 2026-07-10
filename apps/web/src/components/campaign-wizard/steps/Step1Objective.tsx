import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/select';
import { useMetaPageWhatsappNumbers } from '../hooks/useMetaPages';
import { useMetaAssetSelection } from '../hooks/useMetaAssetSelection';
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
    description: 'Receba mensagens de clientes interessados no WhatsApp, Instagram Direct ou Messenger.',
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
        <h3 className="text-lg font-bold text-gray-900">Qual o objetivo da sua campanha?</h3>
        <p className="text-sm text-gray-500 mt-1">Escolha o que você mais quer alcançar com este anúncio.</p>
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
                  ? 'border-[#E8631A] bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-[#E8631A]/40'
              )}
            >
              <div className="text-3xl leading-none">{option.emoji}</div>
              <div className="flex-1">
                <div className="font-bold text-gray-900">{option.title}</div>
                <div className="text-sm text-gray-500 mt-1">{option.description}</div>
              </div>
              <div
                className={cn(
                  'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1',
                  isSelected ? 'border-[#E8631A] bg-[#E8631A]' : 'border-gray-300'
                )}
              >
                {isSelected && <Check className="w-4 h-4 text-white" />}
              </div>
            </button>
          );
        })}
      </div>

      {value === 'whatsapp' && whatsapp && onWhatsappChange && (
        <MessagingDestinationFields whatsapp={whatsapp} onWhatsappChange={onWhatsappChange} />
      )}
    </div>
  );
}

// ── Messaging destination fields (moved from Step3Audience) ──────────────────

function MessagingDestinationFields({
  whatsapp,
  onWhatsappChange,
}: {
  whatsapp: WizardWhatsappState;
  onWhatsappChange: (updates: Partial<WizardWhatsappState>) => void;
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
      destinations: page.hasWhatsApp || page.hasInstagram ? [] : ['messenger'],
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
    <div className="rounded-xl border border-gray-200 p-4 space-y-4 bg-gray-50/50">
      <div>
        <h4 className="text-sm font-bold text-gray-900">Destino das mensagens</h4>
        <p className="text-xs text-gray-500 mt-0.5">Escolha onde deseja receber as conversas.</p>
      </div>

      {isLoadingPages && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando dados do seu negócio...
        </div>
      )}

      {isPagesError && (
        <p className="text-xs text-red-600">
          Não foi possível carregar os dados do seu negócio. Verifique a conexão Meta em Configurações → Integrações.
        </p>
      )}

      {!isLoadingPages && !isPagesError && pages.length === 0 && (
        <p className="text-xs text-amber-700">
          Nenhuma Página selecionada na conexão Meta. Configure em Configurações → Integrações.
        </p>
      )}

      {pages.length > 1 && (
        <div>
          <label className="text-sm font-bold text-gray-900 mb-1 block">Qual negócio vai anunciar?</label>
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
          <label className="text-sm font-bold text-gray-900 mb-2 block">Onde quer receber as mensagens?</label>
          {onlyMessengerAvailable && (
            <p className="text-xs text-amber-700 mb-2">
              Este negócio só tem Facebook disponível. Para usar WhatsApp, vincule um número WABA. Para usar Instagram, conecte sua conta Instagram à Página no Meta Business.
            </p>
          )}
          <div className="space-y-3">
            {whatsapp.hasWhatsApp && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsapp.destinations.includes('whatsapp')}
                    onChange={() => toggleDestination('whatsapp')}
                    className="w-4 h-4 rounded border-gray-300 text-[#E8631A] focus:ring-[#E8631A]"
                  />
                  WhatsApp
                </label>
                <p className="text-xs text-gray-500 ml-6">As pessoas vão te chamar pelo WhatsApp</p>
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
                        <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                      )}
                    </div>
                    {pageHasNoWhatsapp && (
                      <p className="text-xs text-amber-700 mt-1">
                        Esta página não tem número de WhatsApp vinculado. Vincule um número no Meta Business.
                      </p>
                    )}
                    {isNumbersError && (
                      <p className="text-xs text-red-600 mt-1">
                        Não foi possível carregar os números de WhatsApp desta página. Tente novamente.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {whatsapp.hasInstagram && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsapp.destinations.includes('instagram_direct')}
                    onChange={() => toggleDestination('instagram_direct')}
                    className="w-4 h-4 rounded border-gray-300 text-[#E8631A] focus:ring-[#E8631A]"
                  />
                  Instagram
                </label>
                <p className="text-xs text-gray-500 ml-6">As pessoas vão te chamar pelo Instagram</p>
                {whatsapp.destinations.includes('instagram_direct') && (
                  <div className="mt-1 ml-6 text-sm text-gray-600">@{whatsapp.instagramUsername}</div>
                )}
              </div>
            )}

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={whatsapp.destinations.includes('messenger')}
                  onChange={() => toggleDestination('messenger')}
                  className="w-4 h-4 rounded border-gray-300 text-[#E8631A] focus:ring-[#E8631A]"
                />
                Facebook
              </label>
              <p className="text-xs text-gray-500 ml-6">As pessoas vão te chamar pelo Facebook</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
