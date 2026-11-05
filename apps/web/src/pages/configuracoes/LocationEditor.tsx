import { useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { useMetaLocations, type MetaLocationOption } from '@/components/campaign-wizard/hooks/useMetaLocations';
import { Button } from '@/components/ui/button';
import type { AudienceGeo, GeoRegionType } from '@/components/campaign-wizard/types';
import {
  MAX_GEO_REGIONS, MAX_GEO_POINTS, DEFAULT_POINT_RADIUS_KM, ADMIN_MAX_GEO_ITEMS,
  MIN_POINT_RADIUS_KM, MAX_POINT_RADIUS_KM, POINT_RADIUS_STEP_KM, regionLabel,
} from '@/components/campaign-wizard/types';
import { GeoPointsMap } from './GeoPointsMap';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

const SEARCH_TYPES = ['country', 'region', 'city'];
const TYPE_LABEL: Record<GeoRegionType, string> = { country: 'País', region: 'Estado', city: 'Cidade' };
const TYPE_PLURAL: Record<GeoRegionType, string> = { country: 'país', region: 'estados', city: 'cidades' };
// Trocável sem deploy de código (exigência da política do Nominatim)
const GEOCODER_URL = import.meta.env.VITE_GEOCODER_URL ?? 'https://nominatim.openstreetmap.org/search';
// Mesma precisão enviada à Meta
const round6 = (n: number) => Number(n.toFixed(6));
const apiErrorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || fallback;
// Raio no passo de 0,5 km, dentro da faixa da Meta
const clampRadius = (v: number) =>
  Math.min(MAX_POINT_RADIUS_KM, Math.max(MIN_POINT_RADIUS_KM, Math.round(v / POINT_RADIUS_STEP_KM) * POINT_RADIUS_STEP_KM));

interface LocationEditorProps {
  value: AudienceGeo;
  onChange: (update: (prev: AudienceGeo) => AudienceGeo) => void;
  // Mostra o aviso do padrão antigo (cidade + 30 km)
  legacyCity?: string;
  // Superadmin: sem GPS, até 50 itens, raio editável por ponto
  admin?: boolean;
  tenantId?: string;
}

export function LocationEditor({ value, onChange, legacyCity, admin = false, tenantId }: LocationEditorProps) {
  const { mode: geoMode, regions, points: geoPoints, base: geoBase } = value;
  const regionType = regions.length ? value.regionType : undefined;
  const maxRegions = admin ? ADMIN_MAX_GEO_ITEMS : MAX_GEO_REGIONS;
  const maxPoints = admin ? ADMIN_MAX_GEO_ITEMS : MAX_GEO_POINTS;
  const [cityQuery, setCityQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [baseQuery, setBaseQuery] = useState(geoBase?.label ?? '');
  const [baseLoading, setBaseLoading] = useState(false);
  const [baseError, setBaseError] = useState('');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const { locations, isLoading: loadingLocations } = useMetaLocations(cityQuery, tenantId, SEARCH_TYPES);

  const canUseMyLocation = (!regions.length || regionType === 'city') && regions.length < maxRegions;

  // Motivo para não aceitar o item ('' = pode)
  function blockReason(type: GeoRegionType, key: string): string {
    if (regions.some((r) => r.key === key)) return 'Já selecionado';
    if (regions.length && type !== regionType) return `Só ${TYPE_PLURAL[regionType!]}`;
    if (regions.length >= (type === 'country' && !admin ? 1 : maxRegions)) return 'Limite atingido';
    return '';
  }

  function handleSelectLocation(location: MetaLocationOption) {
    setShowDropdown(false);
    const type = location.type as GeoRegionType | undefined;
    if (!type || !TYPE_LABEL[type] || blockReason(type, location.key)) return;
    setCityQuery('');
    onChange((prev) => ({
      ...prev,
      regionType: type,
      regions: [...prev.regions, {
        key: location.key, name: location.name, region: location.region,
        ...(type === 'country' ? { countryCode: location.country_code ?? location.key } : {}),
      }],
    }));
  }

  function handleRemoveRegion(key: string) {
    onChange((prev) => {
      const next = prev.regions.filter((r) => r.key !== key);
      return { ...prev, regions: next, regionType: next.length ? prev.regionType : undefined };
    });
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
    if (geoPoints.length >= maxPoints) return;
    onChange((prev) => ({ ...prev, points: [...prev.points, { lat: round6(lat), lng: round6(lng), radiusKm: DEFAULT_POINT_RADIUS_KM }] }));
  }

  function handleMovePoint(index: number, lat: number, lng: number) {
    onChange((prev) => ({ ...prev, points: prev.points.map((p, i) => (i === index ? { ...p, lat: round6(lat), lng: round6(lng) } : p)) }));
  }

  function handleRadiusChange(index: number, raw: string) {
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v) || raw === '') return;
    onChange((prev) => ({ ...prev, points: prev.points.map((p, i) => (i === index ? { ...p, radiusKm: clampRadius(v) } : p)) }));
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
      onChange((prev) => ({ ...prev, base: { label, lat: Number(first.lat), lng: Number(first.lon) } }));
      setBaseQuery(label);
    } catch {
      setBaseError('Não foi possível buscar o local.');
    } finally {
      setBaseLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-bold text-gray-900 block">Localização</label>
      <div className="grid grid-cols-2 gap-2">
        {([['regions', 'País, estado ou cidade'], ['points', 'Pontos no mapa']] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange((prev) => ({ ...prev, mode }))}
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

      {legacyCity && (
        <p className="text-xs text-amber-700">
          Padrão atual: {legacyCity} com raio de 30 km. Ao alterar e salvar, passa a valer a nova localização.
        </p>
      )}

      {geoMode === 'regions' ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {admin
              ? `O país, o estado ou a cidade é usado inteiro. Até ${maxRegions} itens do mesmo tipo (sem misturar).`
              : `O país, o estado ou a cidade é usado inteiro. Até 1 país, ou até ${MAX_GEO_REGIONS} estados, ou até ${MAX_GEO_REGIONS} cidades (sem misturar).`}
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
            {!admin && (
              <Button variant="outline" size="md" onClick={handleUseMyLocation} disabled={locating || !canUseMyLocation}>
                {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Usar minha localização'}
              </Button>
            )}
          </div>
          {locateError && <p className="text-xs text-red-600">{locateError}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {admin
              ? `A cidade ou o estado só centraliza o mapa e não é enviado. Clique no mapa para pôr até ${maxPoints} pontos (raio padrão de ${DEFAULT_POINT_RADIUS_KM} km, ajustável em cada ponto); arraste o pino para mover.`
              : `A cidade ou o estado só centraliza o mapa e não é enviado. Clique no mapa para pôr até ${MAX_GEO_POINTS} pontos de ${DEFAULT_POINT_RADIUS_KM} km; arraste o pino para mover.`}
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

          <p className={cn('text-sm text-right text-gray-500', geoPoints.length >= maxPoints && 'text-amber-700')}>
            Pontos: {geoPoints.length}/{maxPoints}
          </p>

          {geoPoints.length > 0 && (
            <ul className="space-y-2">
              {geoPoints.map((p, i) => (
                <li key={i} className="flex items-center gap-3 text-sm border border-border rounded-lg px-3 py-2">
                  <span className="font-bold text-[#E8631A]">Ponto {i + 1}</span>
                  <span className="text-gray-500 font-mono text-xs">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span>
                  {admin ? (
                    <label className="flex items-center gap-1 text-gray-700 ml-auto">
                      Raio (km)
                      <input
                        type="number"
                        min={MIN_POINT_RADIUS_KM}
                        max={MAX_POINT_RADIUS_KM}
                        step={POINT_RADIUS_STEP_KM}
                        value={p.radiusKm}
                        onChange={(e) => handleRadiusChange(i, e.target.value)}
                        aria-label={`Raio do ponto ${i + 1} em km`}
                        className="w-20 px-2 py-1 border border-border rounded-md bg-background"
                      />
                    </label>
                  ) : (
                    <span className="text-gray-700 ml-auto">Raio {p.radiusKm.toLocaleString('pt-BR')} km</span>
                  )}
                  <button
                    type="button"
                    aria-label={`Remover ponto ${i + 1}`}
                    onClick={() => onChange((prev) => ({ ...prev, points: prev.points.filter((_, j) => j !== i) }))}
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
    </div>
  );
}
