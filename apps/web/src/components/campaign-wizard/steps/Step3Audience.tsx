import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useMetaLocations } from '../hooks/useMetaLocations';
import { AGE_OPTIONS, RADIUS_OPTIONS, type RadiusOption, type WizardAudienceState, type WizardGender } from '../types';

interface Step3AudienceProps {
  value: WizardAudienceState;
  onChange: (updates: Partial<WizardAudienceState>) => void;
}

const GENDER_OPTIONS: { value: WizardGender; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'male', label: 'Homens' },
  { value: 'female', label: 'Mulheres' },
];

export function Step3Audience({ value, onChange }: Step3AudienceProps) {
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
