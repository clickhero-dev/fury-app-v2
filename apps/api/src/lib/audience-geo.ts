import { z } from 'zod';

export const MAX_GEO_CITIES = 4;
export const MAX_GEO_POINTS = 4;

// Formato salvo em audienceDefaults.geo (nomes nossos, não os da Meta)
export const audienceGeoSchema = z.object({
  mode: z.enum(['cities', 'custom']),
  cities: z.array(z.object({
    key: z.string().regex(/^\d+$/, 'Chave de cidade inválida'),
    name: z.string().min(1).max(200),
    region: z.string().max(200).optional(),
  })).max(MAX_GEO_CITIES).default([]),
  base: z.object({
    label: z.string().max(200),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
  points: z.array(z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusKm: z.number().positive(),
  })).max(MAX_GEO_POINTS).default([]),
});

export type AudienceGeo = z.infer<typeof audienceGeoSchema>;

// Só o modo ativo conta
export function hasGeoLocations(geo: AudienceGeo | undefined): geo is AudienceGeo {
  if (!geo) return false;
  return geo.mode === 'cities' ? geo.cities.length > 0 : geo.points.length > 0;
}

const round = (n: number, d: number) => Number(n.toFixed(d));

// Converte para o geo_locations da Meta
export function buildGeoLocations(geo: AudienceGeo): Record<string, unknown> {
  if (geo.mode === 'cities') {
    return { cities: geo.cities.map((c) => ({ key: parseInt(c.key, 10) })) };
  }
  return {
    custom_locations: geo.points.map((p) => ({
      latitude: round(p.lat, 6),
      longitude: round(p.lng, 6),
      radius: round(p.radiusKm, 3),
      distance_unit: 'kilometer',
    })),
  };
}
