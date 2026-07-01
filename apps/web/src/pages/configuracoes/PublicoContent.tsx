import { useState, useEffect } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { useMetaLocations } from '@/components/campaign-wizard/hooks/useMetaLocations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components';
import type { WizardGender } from '@/components/campaign-wizard/types';
import { AGE_OPTIONS } from '@/components/campaign-wizard/types';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface AudienceDefaults {
  city?: string;
  cityKey?: string;
  ageMin?: number;
  ageMax?: number;
  gender?: WizardGender;
}

interface MeResponse {
  audienceDefaults?: AudienceDefaults;
}

const GENDER_OPTIONS: { value: WizardGender; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'male', label: 'Homens' },
  { value: 'female', label: 'Mulheres' },
];

export function PublicoContent() {
  const [cityQuery, setCityQuery] = useState('');
  const [city, setCity] = useState('');
  const [cityKey, setCityKey] = useState<string | undefined>();
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [gender, setGender] = useState<WizardGender>('all');
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { locations, isLoading: loadingLocations } = useMetaLocations(cityQuery);

  // Load saved defaults
  useEffect(() => {
    api.get<{ success: boolean; data: MeResponse }>('/auth/me').then((res) => {
      const defaults = res.data.data?.audienceDefaults;
      if (defaults) {
        if (defaults.city) {
          setCity(defaults.city);
          setCityQuery(defaults.city);
        }
        if (defaults.cityKey) setCityKey(defaults.cityKey);
        if (defaults.ageMin) setAgeMin(defaults.ageMin);
        if (defaults.ageMax) setAgeMax(defaults.ageMax);
        if (defaults.gender) setGender(defaults.gender);
      }
    }).catch(() => {
      // silently ignore fetch errors — defaults remain empty
    });
  }, []);

  function handleSelectLocation(location: { key: string; name: string; region?: string }) {
    const label = location.region ? `${location.name}, ${location.region}` : location.name;
    setCityQuery(label);
    setCity(label);
    setCityKey(location.key);
    setShowDropdown(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch('/auth/me', {
        audienceDefaults: { city, cityKey, ageMin, ageMax, gender },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // save failed silently
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="p-6 space-y-6">
        <div>
          <h3 className="text-lg font-bold text-text-primary mb-1">Público padrão</h3>
          <p className="text-sm text-text-secondary">
            Esses dados serão usados como padrão ao criar novas campanhas.
          </p>
        </div>

        <div className="space-y-5">
          {/* Cidade */}
          <div className="relative">
            <label className="text-sm font-bold text-gray-900 mb-1 block">Cidade</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={cityQuery}
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  setCity(e.target.value);
                  setCityKey(undefined);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Digite o nome da cidade"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/20"
              />
              {loadingLocations && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
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

          {/* Faixa etária */}
          <div>
            <label className="text-sm font-bold text-gray-900 mb-1 block">Faixa etária</label>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">De</span>
              <Select
                value={ageMin}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setAgeMin(val);
                  setAgeMax(Math.max(val, ageMax));
                }}
                className="flex-1"
              >
                {AGE_OPTIONS.map((age) => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </Select>
              <span className="text-sm text-gray-500">até</span>
              <Select
                value={ageMax}
                onChange={(e) => setAgeMax(Number(e.target.value))}
                className="flex-1"
              >
                {AGE_OPTIONS.filter((age) => age >= ageMin).map((age) => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Gênero */}
          <div>
            <label className="text-sm font-bold text-gray-900 mb-1 block">Gênero</label>
            <div className="grid grid-cols-3 gap-2">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setGender(option.value)}
                  className={cn(
                    'py-3 rounded-lg border-2 text-sm font-bold transition-all',
                    gender === option.value
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

        <div className="flex items-center gap-3 pt-4 border-t border-border">
          <Button variant="primary" size="md" disabled={saving} onClick={handleSave}>
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
          </Button>
          {saved && <span className="text-sm text-green-600">Configurações salvas.</span>}
        </div>
      </div>
    </Card>
  );
}
