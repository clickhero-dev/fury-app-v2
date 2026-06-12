import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useMetaLocations } from '../hooks/useMetaLocations';
import { useMetaPageWhatsappNumbers } from '../hooks/useMetaPages';
import { useMetaAssetSelection } from '../hooks/useMetaAssetSelection';
import {
  AGE_OPTIONS,
  RADIUS_OPTIONS,
  type RadiusOption,
  type WizardAudienceState,
  type WizardGender,
  type WizardMessagingDestination,
  type WizardObjective,
  type WizardWhatsappState,
} from '../types';

interface Step3AudienceProps {
  value: WizardAudienceState;
  onChange: (updates: Partial<WizardAudienceState>) => void;
  objective: WizardObjective | null;
  whatsapp: WizardWhatsappState;
  onWhatsappChange: (updates: Partial<WizardWhatsappState>) => void;
}

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
        pageId: undefined,
        pageName: undefined,
        hasWhatsApp: undefined,
        hasInstagram: undefined,
        destinations: [],
        phoneNumberId: undefined,
        phoneNumberDisplay: undefined,
        instagramUserId: undefined,
        instagramUsername: undefined,
      });
      return;
    }

    onWhatsappChange({
      pageId: page.pageId,
      pageName: page.name,
      hasWhatsApp: page.hasWhatsApp,
      hasInstagram: page.hasInstagram,
      destinations: page.hasWhatsApp || page.hasInstagram ? [] : ['messenger'],
      phoneNumberId: undefined,
      phoneNumberDisplay: undefined,
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
          Não foi possível carregar os dados do seu negócio. Verifique a conexão Meta em Configurações →
          Integrações.
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
              <option key={page.pageId} value={page.pageId}>
                {page.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {whatsapp.pageId && (
        <div>
          <label className="text-sm font-bold text-gray-900 mb-2 block">Onde quer receber as mensagens?</label>

          {onlyMessengerAvailable && (
            <p className="text-xs text-amber-700 mb-2">
              Este negócio só tem Facebook disponível. Para usar WhatsApp, vincule um número WABA. Para usar
              Instagram, conecte sua conta Instagram à Página no Meta Business.
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
                  <div className="mt-1 ml-6 text-sm text-gray-600">
                    @{whatsapp.instagramUsername}
                  </div>
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

const GENDER_OPTIONS: { value: WizardGender; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'male', label: 'Homens' },
  { value: 'female', label: 'Mulheres' },
];

export function Step3Audience({ value, onChange, objective, whatsapp, onWhatsappChange }: Step3AudienceProps) {
  const [cityQuery, setCityQuery] = useState(value.city);
  const [showDropdown, setShowDropdown] = useState(false);
  const { locations, isLoading } = useMetaLocations(cityQuery);

  function handleSelectLocation(location: { key: string; name: string; region?: string }) {
    const label = location.region ? `${location.name}, ${location.region}` : location.name;
    setCityQuery(label);
    setShowDropdown(false);
    onChange({ city: label, cityKey: location.key });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Quem deve ver esse anúncio?</h3>
        <p className="text-sm text-gray-500 mt-1">Defina a localização e o perfil do público.</p>
      </div>

      {objective === 'whatsapp' && (
        <MessagingDestinationFields whatsapp={whatsapp} onWhatsappChange={onWhatsappChange} />
      )}

      <div className="relative">
        <label className="text-sm font-bold text-gray-900 mb-1 block">Cidade</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={cityQuery}
            onChange={(e) => {
              setCityQuery(e.target.value);
              setShowDropdown(true);
              onChange({ city: e.target.value, cityKey: undefined });
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Digite o nome da cidade"
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/20"
          />
          {isLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
        </div>

        {showDropdown && locations.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {locations.map((location) => (
              <button
                key={location.key}
                type="button"
                onMouseDown={() => handleSelectLocation(location)}
                className="w-full text-left px-4 py-2 hover:bg-orange-50 text-sm text-gray-900"
              >
                {location.region ? `${location.name}, ${location.region}` : location.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="text-sm font-bold text-gray-900 mb-1 block">Raio de alcance</label>
        <Select
          value={value.radiusKm}
          onChange={(e) => onChange({ radiusKm: Number(e.target.value) as RadiusOption })}
        >
          {RADIUS_OPTIONS.map((radius) => (
            <option key={radius} value={radius}>
              {radius} km
            </option>
          ))}
        </Select>
        <p className="text-xs text-gray-400 mt-1">Pessoas dentro desse raio ao redor da cidade.</p>
      </div>

      <div>
        <label className="text-sm font-bold text-gray-900 mb-1 block">Faixa etária</label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">De</span>
          <Select
            value={value.ageMin}
            onChange={(e) => {
              const ageMin = Number(e.target.value);
              onChange({ ageMin, ageMax: Math.max(ageMin, value.ageMax) });
            }}
            className="flex-1"
          >
            {AGE_OPTIONS.map((age) => (
              <option key={age} value={age}>
                {age}
              </option>
            ))}
          </Select>
          <span className="text-sm text-gray-500">até</span>
          <Select
            value={value.ageMax}
            onChange={(e) => onChange({ ageMax: Number(e.target.value) })}
            className="flex-1"
          >
            {AGE_OPTIONS.filter((age) => age >= value.ageMin).map((age) => (
              <option key={age} value={age}>
                {age}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <label className="text-sm font-bold text-gray-900 mb-1 block">Gênero</label>
        <div className="grid grid-cols-3 gap-2">
          {GENDER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ gender: option.value })}
              className={cn(
                'py-3 rounded-lg border-2 text-sm font-bold transition-all',
                value.gender === option.value
                  ? 'border-[#E8631A] bg-orange-50 text-[#E8631A]'
                  : 'border-gray-200 text-gray-600 hover:border-[#E8631A]/40'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
