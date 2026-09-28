import { useState, useEffect } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { useMetaLocations } from '@/components/campaign-wizard/hooks/useMetaLocations';
import { useMetaInterests } from '@/components/campaign-wizard/hooks/useMetaInterests';
import { Button } from '@/components/ui/button';
import { Card } from '@/components';
import type { AudienceGeo, GeoRegionType, WizardGender } from '@/components/campaign-wizard/types';
import {
  AGE_OPTIONS, MAX_GEO_REGIONS, MAX_GEO_POINTS, DEFAULT_POINT_RADIUS_KM, isValidGeo, hasGeoLocations, buildGeoLocations,
} from '@/components/campaign-wizard/types';
import type { MetaLocationOption } from '@/components/campaign-wizard/hooks/useMetaLocations';
import { GeoPointsMap } from './GeoPointsMap';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface AudienceDefaults {
  city?: string;
  cityKey?: string;
  ageMin?: number;
  ageMax?: number;
  gender?: WizardGender;
  audienceInterests?: { id: string; name: string }[];
  geo?: unknown;
}

type GeoRegion = AudienceGeo['regions'][number];
const SEARCH_TYPES = ['country', 'region', 'city'];
const TYPE_LABEL: Record<GeoRegionType, string> = { country: 'País', region: 'Estado', city: 'Cidade' };
const TYPE_PLURAL: Record<GeoRegionType, string> = { country: 'país', region: 'estados', city: 'cidades' };
// Trocável sem deploy de código (exigência da política do Nominatim)
const GEOCODER_URL = import.meta.env.VITE_GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/search';
const regionLabel = (r: GeoRegion, type?: GeoRegionType) => (type === 'city' && r.region ? `${r.name}, ${r.region}` : r.name);
// Mesma precisão enviada à Meta
const round6 = (n: number) => Number(n.toFixed(6));
const apiErrorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || fallback;

interface MeResponse {
  audienceDefaults?: AudienceDefaults;
  businessContext?: string | null;
}

const GENDER_OPTIONS: { value: WizardGender; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'male', label: 'Homens' },
  { value: 'female', label: 'Mulheres' },
];

export function PublicoContent() {
  const [cityQuery, setCityQuery] = useState('');
  const [city, setCity] = useState('');
  const [cityKey, setCityKey] = useState('');
  const [geoMode, setGeoMode] = useState<AudienceGeo['mode']>('regions');
  const [regionType, setRegionType] = useState<GeoRegionType>();
  const [regions, setRegions] = useState<GeoRegion[]>([]);
  const [geoPoints, setGeoPoints] = useState<AudienceGeo['points']>([]);
  const [geoBase, setGeoBase] = useState<AudienceGeo['base']>();
  const [baseQuery, setBaseQuery] = useState('');
  const [baseLoading, setBaseLoading] = useState(false);
  const [baseError, setBaseError] = useState('');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  // Padrão antigo (só city/cityKey) só vira geo quando o usuário mexe
  const [geoTouched, setGeoTouched] = useState(false);
  const [hasSavedGeo, setHasSavedGeo] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [gender, setGender] = useState<WizardGender>('all');
  const [showDropdown, setShowDropdown] = useState(false);
  const [businessContext, setBusinessContext] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [audienceInterests, setAudienceInterests] = useState<{ id: string; name: string }[]>([]);
  const [interestQuery, setInterestQuery] = useState('');
  const [showInterestDropdown, setShowInterestDropdown] = useState(false);
  const { locations, isLoading: loadingLocations } = useMetaLocations(cityQuery, undefined, SEARCH_TYPES);
  const { interests, isLoading: loadingInterests } = useMetaInterests(interestQuery);

  // Load saved defaults
  useEffect(() => {
    api.get<{ success: boolean; data: MeResponse }>('/auth/me').then((res) => {
      const data = res.data.data;
      const defaults = data.audienceDefaults;
      if (defaults) {
        if (defaults.city) setCity(defaults.city);
        if (defaults.cityKey) setCityKey(defaults.cityKey);
        // geo antigo/inválido é ignorado (usa o padrão normal)
        if (isValidGeo(defaults.geo)) {
          const g = defaults.geo;
          setHasSavedGeo(true);
          setGeoMode(g.mode);
          setRegionType(g.regions.length ? g.regionType : undefined);
          setRegions(g.regions);
          setGeoPoints(g.points);
          setGeoBase(g.base);
          if (g.base) setBaseQuery(g.base.label);
        } else if (defaults.city && defaults.cityKey) {
          setRegionType('city');
          setRegions([{ key: defaults.cityKey, name: defaults.city }]);
        }
        if (defaults.ageMin) setAgeMin(defaults.ageMin);
        if (defaults.ageMax) setAgeMax(defaults.ageMax);
        if (defaults.gender) setGender(defaults.gender);
        if (defaults.audienceInterests) setAudienceInterests(defaults.audienceInterests);
      }
      if (data.businessContext) setBusinessContext(data.businessContext);
    }).catch(() => {
      // silently ignore fetch errors — defaults remain empty
    });
  }, []);

  const geo: AudienceGeo = { mode: geoMode, regionType: regions.length ? regionType : undefined, regions, base: geoBase, points: geoPoints };
  const saveGeo = hasSavedGeo || geoTouched;
  // TESTE: prévia do envio (geo novo ou cidade + 30 km)
  const sentPreview = saveGeo && hasGeoLocations(geo)
    ? buildGeoLocations(geo)
    : cityKey ? { cities: [{ key: parseInt(cityKey, 10), radius: 30, distance_unit: 'kilometer' }] } : null;
  const canUseMyLocation = (!regions.length || regionType === 'city') && regions.length < MAX_GEO_REGIONS;

  // Motivo para não aceitar o item ('' = pode)
  function blockReason(type: GeoRegionType, key: string): string {
    if (regions.some((r) => r.key === key)) return 'Já selecionado';
    if (regions.length && type !== regionType) return `Só ${TYPE_PLURAL[regionType!]}`;
    if (regions.length >= (type === 'country' ? 1 : MAX_GEO_REGIONS)) return 'Limite atingido';
    return '';
  }

  function handleSelectLocation(location: MetaLocationOption) {
    setShowDropdown(false);
    const type = location.type as GeoRegionType | undefined;
    if (!type || !TYPE_LABEL[type] || blockReason(type, location.key)) return;
    setCityQuery('');
    setRegionType(type);
    setRegions((prev) => [...prev, {
      key: location.key, name: location.name, region: location.region,
      ...(type === 'country' ? { countryCode: location.country_code ?? location.key } : {}),
    }]);
    setGeoTouched(true);
  }

  function handleRemoveRegion(key: string) {
    const next = regions.filter((r) => r.key !== key);
    setRegions(next);
    if (!next.length) setRegionType(undefined);
    setGeoTouched(true);
  }

  // GPS do navegador → cidade pela Meta
  function handleUseMyLocation() {
    setLocateError('');
    if (!navigator.geolocation) {
      setLocateError('Seu navegador não permite pegar a localização. Digite o nome da cidade.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await api.get<{ data: MetaLocationOption }>('/campaigns/meta-city-by-coords', {
            params: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          });
          const cityFound = res.data.data;
          if (regions.some((r) => r.key === cityFound.key)) setLocateError(`${cityFound.name} já está na lista.`);
          else handleSelectLocation({ ...cityFound, type: 'city' });
        } catch (err) {
          setLocateError(apiErrorMessage(err, 'Não foi possível descobrir a sua cidade. Digite o nome da cidade.'));
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setLocateError('Não foi possível pegar a sua localização (permissão negada?). Digite o nome da cidade.');
      },
      { timeout: 10000 },
    );
  }

  function handleAddPoint(lat: number, lng: number) {
    if (geoPoints.length >= MAX_GEO_POINTS) return;
    setGeoPoints((prev) => [...prev, { lat: round6(lat), lng: round6(lng), radiusKm: DEFAULT_POINT_RADIUS_KM }]);
    setGeoTouched(true);
  }

  function handleMovePoint(index: number, lat: number, lng: number) {
    setGeoPoints((prev) => prev.map((p, i) => (i === index ? { ...p, lat: round6(lat), lng: round6(lng) } : p)));
    setGeoTouched(true);
  }

  // Base do mapa (só centraliza, não é enviada); busca por botão, sem autocompletar
  async function handleSearchBase() {
    const q = baseQuery.trim() || (regions[0] ? regionLabel(regions[0], regionType) : '');
    if (!q) return;
    setBaseLoading(true);
    setBaseError('');
    try {
      const res = await fetch(`${GEOCODER_URL}?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`);
      const [first] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      if (!first) {
        setBaseError('Local não encontrado.');
        return;
      }
      const label = first.display_name.split(',').slice(0, 2).join(',').trim();
      setGeoBase({ label, lat: Number(first.lat), lng: Number(first.lon) });
      setBaseQuery(label);
      setGeoTouched(true);
    } catch {
      setBaseError('Não foi possível buscar o local.');
    } finally {
      setBaseLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    // Campos antigos seguem preenchidos (wizard, revisão e planner leem city)
    let legacyCity = city;
    let legacyKey = cityKey;
    if (saveGeo) {
      if (geoMode === 'points' && geoPoints.length) {
        legacyCity = geoBase?.label || 'Pontos personalizados';
        legacyKey = '';
      } else if (regions.length) {
        legacyCity = regionLabel(regions[0], regionType);
        legacyKey = regionType === 'city' ? regions[0].key : '';
      } else {
        legacyCity = '';
        legacyKey = '';
      }
    }
    try {
      await api.patch('/auth/me', {
        audienceDefaults: {
          city: legacyCity, cityKey: legacyKey, ageMin, ageMax, gender, audienceInterests,
          ...(saveGeo ? { geo } : {}),
        },
        businessContext: businessContext || undefined,
      });
      setCity(legacyCity);
      setCityKey(legacyKey);
      if (saveGeo) setHasSavedGeo(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Contexto do Negócio */}
      <Card>
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-text-primary mb-1">Contexto do Negócio</h3>
            <p className="text-sm text-text-secondary">
              Descreva o nicho, os clientes e o contexto da empresa. Esse texto é usado como contexto
              pela IA ao gerar criativos e recomendações.
            </p>
          </div>

          <div>
            <label className="text-sm font-bold text-gray-900 mb-2 block">
              O que sua empresa faz, nicho de mercado e perfil dos clientes
            </label>
            <textarea
              value={businessContext}
              onChange={(e) => setBusinessContext(e.target.value)}
              placeholder="Ex: Somos uma clínica de estética em São Paulo especializada em tratamentos faciais. Nosso público são mulheres de 25 a 50 anos, classes A e B, que buscam procedimentos não-invasivos como toxina botulínica e preenchimento."
              rows={6}
              className="w-full px-4 py-3 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:border-admin-petrol focus:ring-2 focus:ring-admin-petrol/20 resize-y min-h-[120px]"            />
            <p className="text-xs text-gray-500 mt-1">
              Seja detalhado: quanto mais informações, melhor a IA entenderá seu negócio.
              Ex: nicho, porte, região, ticket médio, diferencial competitivo, público-alvo.
            </p>
          </div>
        </div>
      </Card>

      {/* Público padrão */}
      <Card>
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-text-primary mb-1">Público padrão</h3>
            <p className="text-sm text-text-secondary">
              Esses dados serão usados como padrão ao criar novas campanhas.
            </p>
          </div>

          <div className="space-y-5">
            {/* Localização */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-gray-900 block">Localização</label>
              <div className="grid grid-cols-2 gap-2">
                {([['regions', 'País, estado ou cidade'], ['points', 'Pontos no mapa']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setGeoMode(mode); setGeoTouched(true); }}
                    className={cn(
                      'py-3 rounded-lg border-2 text-sm font-bold transition-all duration-200 cursor-pointer',
                      geoMode === mode
                        ? 'border-admin-petrol bg-admin-petrol/10 text-admin-petrol'
                        : 'border-border text-muted-foreground bg-background hover:border-admin-petrol/40'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {!saveGeo && cityKey && (
                <p className="text-xs text-amber-700">
                  Padrão atual: {city} com raio de 30 km. Ao alterar e salvar, passa a valer a nova localização.
                </p>
              )}

              {geoMode === 'regions' ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    O país, o estado ou a cidade é usado inteiro. Até 1 país, ou até {MAX_GEO_REGIONS} estados, ou até {MAX_GEO_REGIONS} cidades (sem misturar).
                  </p>
                  {regions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {regions.map((r) => (
                        <span
                          key={r.key}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-[#E8631A] text-sm rounded-full border border-[#E8631A]/20"
                        >
                          {regionLabel(r, regionType)}
                          <button
                            type="button"
                            aria-label={`Remover ${r.name}`}
                            onClick={() => handleRemoveRegion(r.key)}
                            className="hover:text-red-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={cityQuery}
                        onChange={(e) => {
                          setCityQuery(e.target.value);
                          setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                        placeholder="Digite o país, estado ou cidade"
                        className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:border-admin-petrol focus:ring-2 focus:ring-admin-petrol/20"
                      />
                      {loadingLocations && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
                      {showDropdown && locations.length > 0 && (
                        <div className="absolute z-10 mt-1 left-0 right-0 top-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {locations.map((location) => {
                            const type = location.type as GeoRegionType;
                            const reason = TYPE_LABEL[type] ? blockReason(type, location.key) : 'Tipo não suportado';
                            return (
                              <button
                                key={`${location.type}-${location.key}`}
                                type="button"
                                disabled={Boolean(reason)}
                                onMouseDown={() => handleSelectLocation(location)}
                                className={cn(
                                  'w-full flex items-center justify-between gap-2 text-left px-4 py-2 text-sm',
                                  reason ? 'text-gray-300 cursor-not-allowed' : 'text-gray-900 hover:bg-orange-50'
                                )}
                              >
                                <span>{location.region && type === 'city' ? `${location.name}, ${location.region}` : location.name}</span>
                                <span className="text-xs text-gray-400">{reason || TYPE_LABEL[type]}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <Button variant="outline" size="md" onClick={handleUseMyLocation} disabled={locating || !canUseMyLocation}>
                      {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Usar minha localização'}
                    </Button>
                  </div>
                  {locateError && <p className="text-xs text-red-600">{locateError}</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">
                    A cidade ou o estado só centraliza o mapa e não é enviado. Clique no mapa para pôr até {MAX_GEO_POINTS} pontos de {DEFAULT_POINT_RADIUS_KM} km; arraste o pino para mover.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={baseQuery}
                      onChange={(e) => setBaseQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchBase(); } }}
                      placeholder={regions[0] ? regionLabel(regions[0], regionType) : 'Ex.: Maringá ou Paraná'}
                      className="flex-1 px-4 py-3 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-admin-petrol focus:ring-2 focus:ring-admin-petrol/20"
                    />
                    <Button variant="outline" size="md" onClick={handleSearchBase} disabled={baseLoading}>
                      {baseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                    </Button>
                  </div>
                  {baseError && <p className="text-xs text-red-600">{baseError}</p>}

                  <GeoPointsMap
                    center={geoBase ? { lat: geoBase.lat, lng: geoBase.lng } : undefined}
                    points={geoPoints}
                    onAdd={handleAddPoint}
                    onMove={handleMovePoint}
                  />

                  <p className={cn('text-sm text-right text-gray-500', geoPoints.length >= MAX_GEO_POINTS && 'text-amber-700')}>
                    Pontos: {geoPoints.length}/{MAX_GEO_POINTS}
                  </p>

                  {geoPoints.length > 0 && (
                    <ul className="space-y-2">
                      {geoPoints.map((p, i) => (
                        <li key={i} className="flex items-center gap-3 text-sm border border-border rounded-lg px-3 py-2">
                          <span className="font-bold text-[#E8631A]">Ponto {i + 1}</span>
                          <span className="text-gray-500 font-mono text-xs">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span>
                          <span className="text-gray-700 ml-auto">Raio {p.radiusKm.toLocaleString('pt-BR')} km</span>
                          <button
                            type="button"
                            aria-label={`Remover ponto ${i + 1}`}
                            onClick={() => { setGeoPoints(geoPoints.filter((_, j) => j !== i)); setGeoTouched(true); }}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* TESTE: remover antes do oficial */}
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-600">Ver o JSON (salvo e enviado à Meta)</summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="font-bold text-gray-700">Salvo em audienceDefaults.geo</p>
                    <pre className="p-2 bg-gray-50 rounded border border-border whitespace-pre-wrap break-all">
                      {saveGeo ? JSON.stringify(geo, null, 2) : '(nada — padrão atual)'}
                    </pre>
                  </div>
                  <div>
                    <p className="font-bold text-gray-700">Enviado à Meta em targeting.geo_locations</p>
                    <pre className="p-2 bg-gray-50 rounded border border-border whitespace-pre-wrap break-all">
                      {sentPreview ? JSON.stringify(sentPreview, null, 2) : '(nenhuma localização)'}
                    </pre>
                  </div>
                </div>
              </details>
            </div>

            {/* Faixa etária */}
<div>
  <label className="text-sm font-bold text-foreground mb-1 block">Faixa etária</label>
  <div className="flex items-center gap-3">
    <span className="text-sm text-muted-foreground">De</span>
    <Select
      value={ageMin}
      onChange={(e) => {
        const val = Number(e.target.value);
        setAgeMin(val);
        setAgeMax(Math.max(val, ageMax));
      }}
      className="flex-1 cursor-pointer"
    >
      {AGE_OPTIONS.map((age) => (
        <option key={age} value={age}>{age}</option>
      ))}
    </Select>
    <span className="text-sm text-muted-foreground">até</span>
    <Select
      value={ageMax}
      onChange={(e) => setAgeMax(Number(e.target.value))}
      className="flex-1 cursor-pointer"
    >
      {AGE_OPTIONS.filter((age) => age >= ageMin).map((age) => (
        <option key={age} value={age}>{age}</option>
      ))}
    </Select>
  </div>
</div>

{/* Gênero */}
<div>
  <label className="text-sm font-bold text-foreground mb-1 block">Gênero</label>
  <div className="grid grid-cols-3 gap-2">
    {GENDER_OPTIONS.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => setGender(option.value)}
        className={cn(
          'py-3 rounded-lg border-2 text-sm font-bold transition-all duration-200 cursor-pointer',
          gender === option.value
            ? 'border-admin-petrol bg-admin-petrol/10 text-admin-petrol'
            : 'border-border text-muted-foreground bg-background hover:border-admin-petrol/40'
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
</div>

{/* Interesses */}
<div>
  <label className="text-sm font-bold text-foreground mb-1 block">Interesses</label>
  <p className="text-xs text-gray-500 mb-2">Adicione interesses para segmentar o público (máximo 4)</p>

  {audienceInterests.length > 0 && (
    <div className="flex flex-wrap gap-2 mb-3">
      {audienceInterests.map((interest) => (
        <span
          key={interest.id}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-[#E8631A] text-sm rounded-full border border-[#E8631A]/20"
        >
          {interest.name}
          <button
            type="button"
            onClick={() => setAudienceInterests(audienceInterests.filter((i) => i.id !== interest.id))}
            className="hover:text-red-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ))}
    </div>
  )}

  {audienceInterests.length >= 4 && (
    <p className="text-xs text-amber-700 mb-2">Máximo de 4 interesses atingido.</p>
  )}

  <div className="relative">
    <input
      type="text"
      value={interestQuery}
      onChange={(e) => {
        setInterestQuery(e.target.value);
        setShowInterestDropdown(true);
      }}
      onFocus={() => setShowInterestDropdown(true)}
      onBlur={() => setTimeout(() => setShowInterestDropdown(false), 150)}
      placeholder="Digite para buscar interesses..."
      disabled={audienceInterests.length >= 4}
      className="w-full px-4 py-3 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:border-admin-petrol focus:ring-2 focus:ring-admin-petrol/20 disabled:opacity-50 disabled:cursor-not-allowed"
    />
    {loadingInterests && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}

    {showInterestDropdown && interests.length > 0 && (
      <div className="absolute z-10 mt-1 left-0 right-0 top-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
        {interests.map((interest) => {
          const alreadySelected = audienceInterests.some((i) => i.id === interest.id);
          return (
            <button
              key={interest.id}
              type="button"
              disabled={alreadySelected || audienceInterests.length >= 4}
              onMouseDown={() => {
                if (!alreadySelected && audienceInterests.length < 4) {
                  setAudienceInterests([...audienceInterests, { id: interest.id, name: interest.name }]);
                  setInterestQuery('');
                }
              }}
              className={`w-full text-left px-4 py-2 hover:bg-orange-50 text-sm ${
                alreadySelected || audienceInterests.length >= 4
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-900'
              }`}
            >
              {interest.name}
              {interest.path?.length ? <span className="text-gray-400 ml-1">— {interest.path.slice(-2).join(' > ')}</span> : null}
            </button>
          );
        })}
      </div>
    )}
  </div>
</div>
          </div>
        </div>
      </Card>

      {/* Botão salvar */}
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <Button variant="primary" size="md" disabled={saving} onClick={handleSave}>
          {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
        </Button>
        {saved && <span className="text-sm text-green-600">Configurações salvas.</span>}
        {saveError && <span className="text-sm text-red-600">{saveError}</span>}
      </div>
    </div>
  );
}
