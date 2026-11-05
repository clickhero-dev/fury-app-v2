import { z } from 'zod';

export const DEFAULT_POINT_RADIUS_KM = 10;
// Teto do schema (superadmin); o limite de 4 do cliente fica na tela
export const MAX_GEO_ITEMS = 50;

// Formato salvo em audienceDefaults.geo (nomes nossos, não os da Meta)
export const audienceGeoSchema = z.object({
  mode: z.enum(['regions', 'points']),
  regionType: z.enum(['country', 'region', 'city']).optional(),
  regions: z.array(z.object({
    key: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    region: z.string().max(200).optional(),
    countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  })).max(MAX_GEO_ITEMS).default([]),
  base: z.object({
    label: z.string().max(200),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
  points: z.array(z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusKm: z.number().min(1).max(80),
  })).max(MAX_GEO_ITEMS).default([]),
}).superRefine((geo, ctx) => {
  if (geo.regions.length === 0) return;
  if (!geo.regionType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['regionType'], message: 'Tipo de localização obrigatório' });
    return;
  }
  // País: com código
  if (geo.regionType === 'country') {
    if (geo.regions.some((r) => !r.countryCode)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['regions'], message: 'País sem código' });
    return;
  }
  // Estado/cidade: chave numérica da Meta
  if (geo.regions.some((r) => !/^\d+$/.test(r.key))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['regions'], message: 'Chave de localização inválida' });
  }
});

export type AudienceGeo = z.infer<typeof audienceGeoSchema>;

// Só o modo ativo conta
export function hasGeoLocations(geo: AudienceGeo | undefined): geo is AudienceGeo {
  if (!geo) return false;
  return geo.mode === 'regions' ? geo.regions.length > 0 && Boolean(geo.regionType) : geo.points.length > 0;
}

const round = (n: number, d: number) => Number(n.toFixed(d));

// Converte para o geo_locations da Meta
export function buildGeoLocations(geo: AudienceGeo): Record<string, unknown> {
  if (geo.mode === 'points') {
    return {
      custom_locations: geo.points.map((p) => ({
        latitude: round(p.lat, 6),
        longitude: round(p.lng, 6),
        radius: round(p.radiusKm, 3),
        distance_unit: 'kilometer',
      })),
    };
  }
  if (geo.regionType === 'country') return { countries: geo.regions.map((r) => r.countryCode) };
  // Chave numérica, como o envio que já funciona
  const items = geo.regions.map((r) => ({ key: parseInt(r.key, 10) }));
  return geo.regionType === 'region' ? { regions: items } : { cities: items };
}
