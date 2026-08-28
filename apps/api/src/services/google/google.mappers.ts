/**
 * Funções de mapeamento puras do domínio Google Meu Negócio (GBP).
 * Movidas de google.service.ts (refatoração de modularização) — nenhuma toca
 * em DB/HTTP; recebem e devolvem valores.
 */
import type {
  businessProfileSettings,
  googleBusinessProfiles,
  tenants,
} from '../../lib/db.js';
import type {
  GbpCategory,
  GbpLocation,
  GbpLocationMatch,
  GbpOpenPeriod,
} from '../../lib/google-api.js';
import type {
  GoogleAddress,
  GoogleBusinessHours,
  GoogleCategory,
  GoogleLookupMatch,
  GoogleProfileResult,
} from './google.types.js';

export const EMPTY_ADDRESS: GoogleAddress = { street: '', city: '', state: '', postalCode: '', country: 'BR' };

export const VERIFICATION_INSTRUCTIONS =
  'A Google enviou uma verificação para o seu negócio. Acompanhe o status pelo painel do Google Meu Negócio e conclua os passos solicitados para confirmar que o negócio é seu.';

export const POSTAL_VERIFICATION_INSTRUCTIONS =
  'A verificação por cartão postal envia uma carta com um código para o endereço comercial do seu negócio. Quando receber, siga as instruções do cartão e insira o código no Google Meu Negócio.';

export const DAY_OF_WEEK_MAP: Record<string, string> = {
  monday: 'MONDAY',
  tuesday: 'TUESDAY',
  wednesday: 'WEDNESDAY',
  thursday: 'THURSDAY',
  friday: 'FRIDAY',
  saturday: 'SATURDAY',
  sunday: 'SUNDAY',
};

export function parseGbpTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

export function mapBusinessHoursToPeriods(hours: GoogleBusinessHours): GbpOpenPeriod[] {
  const periods: GbpOpenPeriod[] = [];
  for (const [day, ranges] of Object.entries(hours)) {
    const openDay = DAY_OF_WEEK_MAP[day.toLowerCase()];
    if (!openDay || !ranges || ranges.length === 0) continue;
    for (const range of ranges) {
      periods.push({
        openDay,
        openTime: parseGbpTime(range.open),
        closeDay: openDay,
        closeTime: parseGbpTime(range.close),
      });
    }
  }
  return periods;
}

export function buildGbpLocationFromSettings(
  settings: typeof businessProfileSettings.$inferSelect,
): Partial<GbpLocation> {
  const address = settings.address as Partial<GoogleAddress> | null;
  const location: Partial<GbpLocation> = {
    title: settings.name,
    phoneNumbers: { primaryPhone: settings.phone },
  };

  if (address && (address.street || address.city)) {
    location.address = {
      addressLines: address.street ? [address.street] : undefined,
      locality: address.city || undefined,
      administrativeArea: address.state || undefined,
      postalCode: address.postalCode || undefined,
      regionCode: address.country || 'BR',
      languageCode: 'pt-BR',
    };
  }

  if (settings.email) {
    location.emailAddress = settings.email;
  }
  if (settings.website) {
    location.websiteUri = settings.website;
  }
  if (settings.categoryId) {
    location.categories = [{ categoryId: settings.categoryId }];
  }
  const hours = settings.hours as GoogleBusinessHours | null;
  if (hours) {
    const periods = mapBusinessHoursToPeriods(hours);
    if (periods.length > 0) {
      location.openInfo = { periods };
    }
  }

  return location;
}

export function mapGbpCategory(category: GbpCategory): GoogleCategory {
  return {
    categoryId: category.categoryId,
    displayName: category.displayName ?? '',
    parentId: category.parentId ?? null,
  };
}

export function buildSearchLocation(
  settings: typeof businessProfileSettings.$inferSelect | null,
  tenant: typeof tenants.$inferSelect | null,
): Partial<GbpLocation> {
  const location: Partial<GbpLocation> = {};
  const name = settings?.name || tenant?.name;
  if (name) {
    location.title = name;
  }

  const address = settings?.address as { street?: string; city?: string; state?: string; postalCode?: string; country?: string } | null;
  if (address && (address.street || address.city || address.postalCode)) {
    location.address = {
      addressLines: address.street ? [address.street] : undefined,
      locality: address.city || undefined,
      administrativeArea: address.state || undefined,
      postalCode: address.postalCode || undefined,
      regionCode: address.country || 'BR',
      languageCode: 'pt-BR',
    };
  }

  if (settings?.phone) {
    location.phoneNumbers = { primaryPhone: settings.phone };
  }

  return location;
}

export function getMatchConfidence(match: GbpLocationMatch, searchTitle: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const location = match.location ?? {};
  const name = location.title ?? match.locationName ?? '';
  if (name && searchTitle && name.toLowerCase().includes(searchTitle.toLowerCase())) {
    return 'HIGH';
  }
  if (match.placeId || location.address) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function mapGbpMatch(match: GbpLocationMatch, searchTitle: string): GoogleLookupMatch {
  const location = match.location ?? {};
  const address = location.address ?? {};
  const gbpLocationId = location.name ?? match.locationName ?? '';

  return {
    gbpLocationId,
    name: location.title ?? match.locationName ?? '',
    address: {
      street: address.addressLines?.join(', ') ?? '',
      city: address.locality ?? '',
      state: address.administrativeArea ?? '',
      postalCode: address.postalCode ?? '',
      country: address.regionCode ?? '',
    },
    phone: location.phoneNumbers?.primaryPhone ?? '',
    verificationState: location.verification?.state ?? 'UNVERIFIED',
    claimed: location.metadata?.canOperateGoogleMyBusiness === true,
    confidence: getMatchConfidence(match, searchTitle),
  };
}

export function settingsAreComplete(
  settings: typeof businessProfileSettings.$inferSelect | null,
  tenant: typeof tenants.$inferSelect | null,
): boolean {
  const name = settings?.name ?? tenant?.name ?? '';
  const address = settings?.address as Partial<GoogleAddress> | null;
  const hasAddress = Boolean(address?.street?.trim() || address?.city?.trim());
  const phone = settings?.phone ?? '';
  return Boolean(name.trim()) && hasAddress && Boolean(phone.trim());
}

export function mapGbpLocationToProfile(
  profile: typeof googleBusinessProfiles.$inferSelect,
  gbpLocation: GbpLocation,
  overrideSyncStatus?: GoogleProfileResult['syncStatus'],
): GoogleProfileResult {
  const address = gbpLocation.address ?? {};
  const phoneNumbers = gbpLocation.phoneNumbers ?? {};

  return {
    id: profile.id,
    gbpLocationId: profile.gbpLocationId,
    name: gbpLocation.title ?? profile.name,
    address: {
      street: address.addressLines?.join(', ') ?? '',
      city: address.locality ?? '',
      state: address.administrativeArea ?? '',
      postalCode: address.postalCode ?? '',
      country: address.regionCode ?? 'BR',
    },
    phone: phoneNumbers.primaryPhone ?? profile.phone ?? '',
    email: gbpLocation.emailAddress ?? profile.email ?? '',
    website: gbpLocation.websiteUri ?? profile.website ?? '',
    categoryId: gbpLocation.categories?.[0]?.categoryId ?? profile.categoryId,
    categoryDisplayName: gbpLocation.categories?.[0]?.displayName ?? profile.categoryDisplayName,
    hours: profile.hours as GoogleBusinessHours | null,
    photos: (profile.photos as string[]) ?? [],
    verificationState: (gbpLocation.verification?.state ?? profile.verificationState) as 'UNVERIFIED' | 'VERIFIED',
    syncStatus: overrideSyncStatus ?? (profile.syncStatus as GoogleProfileResult['syncStatus']),
    lastSyncedAt: profile.lastSyncedAt?.toISOString() ?? null,
  };
}

const FIELD_MASK_MAP: Record<string, string> = {
  name: 'title',
  phone: 'phoneNumbers',
  email: 'emailAddress',
  website: 'websiteUri',
  categoryId: 'categories',
  hours: 'openInfo',
  address: 'address',
};

export function buildFieldMask(updates: Partial<GbpLocation>): string[] {
  const mask: string[] = [];
  for (const key of Object.keys(updates)) {
    const gbpField = FIELD_MASK_MAP[key];
    if (gbpField) {
      mask.push(gbpField);
    }
  }
  return mask;
}

export function buildGbpPatchPayload(data: Record<string, unknown>): Partial<GbpLocation> {
  const payload: Partial<GbpLocation> = {};

  if (data.name !== undefined) {
    payload.title = data.name as string;
  }
  if (data.phone !== undefined) {
    payload.phoneNumbers = { primaryPhone: data.phone as string };
  }
  if (data.email !== undefined) {
    payload.emailAddress = data.email as string;
  }
  if (data.website !== undefined) {
    payload.websiteUri = data.website as string;
  }
  if (data.categoryId !== undefined) {
    payload.categories = data.categoryId ? [{ categoryId: data.categoryId as string }] : undefined;
  }
  if (data.hours !== undefined) {
    const hours = data.hours as GoogleBusinessHours | null;
    if (hours) {
      payload.openInfo = { periods: mapBusinessHoursToPeriods(hours) };
    }
  }
  if (data.address !== undefined) {
    const addr = data.address as Partial<GoogleAddress>;
    payload.address = {
      addressLines: addr.street ? [addr.street] : undefined,
      locality: addr.city || undefined,
      administrativeArea: addr.state || undefined,
      postalCode: addr.postalCode || undefined,
      regionCode: addr.country || 'BR',
      languageCode: 'pt-BR',
    };
  }

  return payload;
}

export function hasActualChanges(
  profile: typeof googleBusinessProfiles.$inferSelect,
  data: Record<string, unknown>,
): boolean {
  if (data.name && data.name !== profile.name) return true;
  if (data.phone && data.phone !== profile.phone) return true;
  if (data.email && data.email !== (profile.email ?? '')) return true;
  if (data.website && data.website !== (profile.website ?? '')) return true;
  if (data.categoryId && data.categoryId !== (profile.categoryId ?? '')) return true;
  if (data.hours && JSON.stringify(data.hours) !== JSON.stringify(profile.hours)) return true;
  if (data.address) {
    const currentAddr = profile.address as Partial<GoogleAddress> | null;
    const newAddr = data.address as Partial<GoogleAddress>;
    if (
      newAddr.street !== (currentAddr?.street ?? '') ||
      newAddr.city !== (currentAddr?.city ?? '') ||
      newAddr.state !== (currentAddr?.state ?? '') ||
      newAddr.postalCode !== (currentAddr?.postalCode ?? '') ||
      newAddr.country !== (currentAddr?.country ?? 'BR')
    ) {
      return true;
    }
  }
  return false;
}