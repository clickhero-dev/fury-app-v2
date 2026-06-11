import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useMetaLocations } from '../hooks/useMetaLocations';
import { useMetaPages, useMetaPageWhatsappNumbers } from '../hooks/useMetaPages';
import {
  AGE_OPTIONS,
  RADIUS_OPTIONS,
  type RadiusOption,
  type WizardAudienceState,
  type WizardGender,
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

function WhatsappDestinationFields({
  whatsapp,
  onWhatsappChange,
}: {
  whatsapp: WizardWhatsappState;
  onWhatsappChange: (updates: Partial<WizardWhatsappState>) => void;
}) {
  const { pages, isLoading: isLoadingPages, isError: isPagesError } = useMetaPages(true);
  const {
    numbers,
    isLoading: isLoadingNumbers,
    isError: isNumbersError,
    isLoaded: numbersLoaded,
  } = useMetaPageWhatsappNumbers(whatsapp.pageId);

  const pageHasNoWhatsapp = Boolean(whatsapp.pageId) && numbersLoaded && numbers.length === 0;

  function handleSelectPage(pageId: string) {
    const page = pages.find((p) => p.pageId === pageId);
    onWhatsappChange({
      pageId: pageId || undefined,
      pageName: page?.name,
      phoneNumberId: undefined,
      phoneNumberDisplay: undefined,
    });
  }

  function handleSelectNumber(phoneNumberId: string) {
    const number = numbers.find((n) => n.phoneNumberId === phoneNumberId);
    onWhatsappChange({
      phoneNumberId: phoneNumberId || undefined,
      phoneNumberDisplay: number?.displayPhoneNumber,
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-4 bg-gray-50/50">
      <div>
        <h4 className="text-sm font-bold text-gray-900">Destino no WhatsApp</h4>
        <p className="text-xs text-gray-500 mt-0.5">
          Escolha a Página do Facebook do seu negócio e o número de WhatsApp que receberá as conversas.
        </p>
      </div>

      <div>
        <label className="text-sm font-bold text-gray-900 mb-1 block">Página do Facebook</label>
        <div className="relative">
          <Select
            value={whatsapp.pageId ?? ''}
            onChange={(e) => handleSelectPage(e.target.value)}
            disabled={isLoadingPages}
          >
            <option value="">
              {isLoadingPages ? 'Carregando páginas...' : 'Selecione a página'}
            </option>
            {pages.map((page) => (
              <option key={page.pageId} value={page.pageId}>
                {page.name}
              </option>
            ))}
          </Select>
          {isLoadingPages && (
            <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
          )}
        </div>
        {isPagesError && (
          <p className="text-xs text-red-600 mt-1">
            Não foi possível carregar suas páginas. Verifique a conexão Meta em Configurações → Integrações.
          </p>
        )}
        {!isLoadingPages && !isPagesError && pages.length === 0 && (
          <p className="text-xs text-amber-700 mt-1">
            Nenhuma página encontrada na sua conta Meta conectada.
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-bold text-gray-900 mb-1 block">Número de WhatsApp</label>
        <div className="relative">
          <Select
            value={whatsapp.phoneNumberId ?? ''}
            onChange={(e) => handleSelectNumber(e.target.value)}
            disabled={!whatsapp.pageId || isLoadingNumbers || pageHasNoWhatsapp}
          >
            <option value="">
              {!whatsapp.pageId
                ? 'Escolha a página primeiro'
                : isLoadingNumbers
                  ? 'Carregando números...'
                  : 'Selecione o número'}
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
            Esta página não tem WhatsApp vinculado. Selecione outra ou vincule um número no Meta Business.
          </p>
        )}
        {isNumbersError && (
          <p className="text-xs text-red-600 mt-1">
            Não foi possível carregar os números de WhatsApp desta página. Tente novamente.
          </p>
        )}
      </div>
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
        <WhatsappDestinationFields whatsapp={whatsapp} onWhatsappChange={onWhatsappChange} />
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
