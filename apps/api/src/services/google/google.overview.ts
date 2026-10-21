/**
 * Cálculos puros do painel do dono e do cartão público (spec 015).
 * Sem DB/HTTP; `now` e fuso injetáveis para teste.
 */
import type {
  GbpAddress,
  GbpDate,
  GbpLocation,
  GbpLocationMetadata,
  GbpOpenPeriod,
  GbpSpecialHourPeriod,
} from '../../lib/google-api.js';

export type Weekday = 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';

// Índice = Date#getDay()
const WEEKDAYS: Weekday[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const WEEKDAY_SHORT_PT = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const DAY_MIN = 24 * 60;

const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';
// Só UFs fora do UTC-3 (Brasil sem horário de verão desde 2019)
const UF_TIME_ZONES: Record<string, string> = {
  AM: 'America/Manaus',
  RR: 'America/Boa_Vista',
  RO: 'America/Porto_Velho',
  MT: 'America/Cuiaba',
  MS: 'America/Campo_Grande',
  AC: 'America/Rio_Branco',
};

export function resolveTimeZone(administrativeArea?: string): string {
  return UF_TIME_ZONES[(administrativeArea ?? '').trim().toUpperCase()] ?? DEFAULT_TIME_ZONE;
}

// ---------- Horário de funcionamento ----------

export interface OpenStatus {
  state: 'open' | 'closed' | 'unknown';
  label: string;
}

interface LocalClock {
  dayIndex: number;
  minutes: number;
  year: number;
  month: number;
  day: number;
}

function localClock(now: Date, timeZone: string): LocalClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    year,
    month,
    day,
    minutes: get('hour') * 60 + get('minute'),
    dayIndex: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function toMinutes(time?: { hours?: number; minutes?: number }): number {
  return (time?.hours ?? 0) * 60 + (time?.minutes ?? 0);
}

function formatTime(minutesOfDay: number): string {
  const normalized = ((minutesOfDay % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function sameDate(a: GbpDate | undefined, y: number, m: number, d: number): boolean {
  return a?.year === y && a?.month === m && a?.day === d;
}

// Intervalos [início, fim) em minutos relativos à meia-noite de "hoje"
function intervalsForOffset(
  offset: number,
  clock: LocalClock,
  periods: GbpOpenPeriod[],
  special: GbpSpecialHourPeriod[],
): Array<[number, number]> {
  const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + offset));
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const base = offset * DAY_MIN;

  const override = special.find((s) => sameDate(s.startDate, y, m, d));
  if (override) {
    if (override.closed) return [];
    const start = toMinutes(override.openTime);
    let end = toMinutes(override.closeTime);
    if (end <= start) end += DAY_MIN;
    return [[base + start, base + end]];
  }

  const weekday = WEEKDAYS[date.getUTCDay()];
  return periods
    .filter((p) => p.openDay === weekday)
    .map((p) => {
      const openIdx = WEEKDAYS.indexOf(p.openDay as Weekday);
      const closeIdx = p.closeDay ? WEEKDAYS.indexOf(p.closeDay as Weekday) : openIdx;
      const start = toMinutes(p.openTime);
      let end = ((closeIdx - openIdx + 7) % 7) * DAY_MIN + toMinutes(p.closeTime);
      if (end <= start) end += DAY_MIN;
      return [base + start, base + end] as [number, number];
    });
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** "Aberto · Fecha 18:00" / "Fechado · Abre amanhã às 08:00", como no Google. */
export function computeOpenStatus(
  periods: GbpOpenPeriod[] | undefined,
  specialHours: GbpSpecialHourPeriod[] | undefined,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): OpenStatus {
  const regular = periods ?? [];
  const special = specialHours ?? [];
  if (regular.length === 0 && special.length === 0) {
    return { state: 'unknown', label: 'Horário não informado' };
  }

  const clock = localClock(now, timeZone);
  // Ontem entra para cobrir expediente que vira a meia-noite
  const intervals = mergeIntervals(
    [-1, 0, 1, 2, 3, 4, 5, 6, 7].flatMap((offset) => intervalsForOffset(offset, clock, regular, special)),
  );
  const nowMin = clock.minutes;

  const current = intervals.find(([start, end]) => start <= nowMin && nowMin < end);
  if (current) {
    if (current[1] - nowMin >= 7 * DAY_MIN) return { state: 'open', label: 'Aberto 24 horas' };
    const prefix = current[1] - nowMin <= 60 ? 'Fecha em breve' : 'Aberto';
    return { state: 'open', label: `${prefix} · Fecha ${formatTime(current[1])}` };
  }

  const next = intervals.find(([start]) => start > nowMin);
  if (!next) return { state: 'closed', label: 'Fechado' };

  const dayOffset = Math.floor(next[0] / DAY_MIN);
  const time = formatTime(next[0]);
  if (dayOffset === 0) return { state: 'closed', label: `Fechado · Abre às ${time}` };
  if (dayOffset === 1) return { state: 'closed', label: `Fechado · Abre amanhã às ${time}` };
  const weekday = WEEKDAY_SHORT_PT[(clock.dayIndex + dayOffset) % 7];
  return { state: 'closed', label: `Fechado · Abre ${weekday} às ${time}` };
}

export interface WeeklyHoursDay {
  day: Weekday;
  ranges: Array<{ open: string; close: string }>;
}

/** Semana começando na segunda, com dias fechados vazios. */
export function formatWeeklyHours(periods: GbpOpenPeriod[] | undefined): WeeklyHoursDay[] {
  const order: Weekday[] = [...WEEKDAYS.slice(1), 'SUNDAY'];
  return order.map((day) => ({
    day,
    ranges: (periods ?? [])
      .filter((p) => p.openDay === day)
      .map((p) => ({ open: formatTime(toMinutes(p.openTime)), close: formatTime(toMinutes(p.closeTime)) }))
      .sort((a, b) => a.open.localeCompare(b.open)),
  }));
}

// ---------- Força do perfil ----------

export interface StrengthItem {
  key: string;
  label: string;
  done: boolean;
  weight: number;
}

export interface StrengthReport {
  percent: number;
  complete: boolean;
  missingCount: number;
  items: StrengthItem[];
}

export interface StrengthContext {
  verified: boolean;
  photoCount: number;
}

const MIN_DESCRIPTION_LENGTH = 50;
const MIN_PHOTOS = 3;

/** Estimativa do Ady (o Google não publica a fórmula). */
export function computeProfileStrength(location: GbpLocation, ctx: StrengthContext): StrengthReport {
  const address = location.address ?? {};
  const items: StrengthItem[] = [
    { key: 'name', label: 'Adicione o nome da empresa', done: Boolean(location.title?.trim()), weight: 10 },
    { key: 'category', label: 'Escolha a categoria principal', done: Boolean(location.categories?.length), weight: 10 },
    {
      key: 'address',
      label: 'Adicione o endereço',
      done: Boolean(address.addressLines?.some((l) => l.trim()) || address.locality?.trim()),
      weight: 10,
    },
    { key: 'phone', label: 'Adicione o telefone', done: Boolean(location.phoneNumbers?.primaryPhone?.trim()), weight: 10 },
    { key: 'website', label: 'Adicione o site', done: Boolean(location.websiteUri?.trim()), weight: 10 },
    { key: 'hours', label: 'Informe o horário de funcionamento', done: Boolean(location.openInfo?.periods?.length), weight: 15 },
    {
      key: 'description',
      label: 'Adicione uma descrição',
      done: (location.description?.trim().length ?? 0) >= MIN_DESCRIPTION_LENGTH,
      weight: 10,
    },
    { key: 'photos', label: `Adicione pelo menos ${MIN_PHOTOS} fotos`, done: ctx.photoCount >= MIN_PHOTOS, weight: 10 },
    { key: 'verified', label: 'Verifique a empresa', done: ctx.verified, weight: 10 },
  ];

  const total = items.reduce((sum, i) => sum + i.weight, 0);
  const done = items.filter((i) => i.done).reduce((sum, i) => sum + i.weight, 0);
  const percent = Math.round((100 * done) / total);
  const missingCount = items.filter((i) => !i.done).length;
  return { percent, complete: missingCount === 0, missingCount, items };
}

// ---------- Ações (grade do painel) ----------

export type ActionStatus = 'available' | 'coming_soon' | 'requires_verification' | 'external';

export interface CategoryAction {
  key: string;
  label: string;
  kind: 'core' | 'category';
  status: ActionStatus;
  externalUrl?: string;
}

// Painel do Google para o que o Ady não edita (URL a verificar)
export const GOOGLE_BUSINESS_URL = 'https://business.google.com/';

const CORE_ACTIONS: Array<{ key: string; label: string }> = [
  { key: 'edit_profile', label: 'Editar perfil' },
  { key: 'reviews', label: 'Ler avaliações' },
  { key: 'photos', label: 'Fotos' },
  { key: 'posts', label: 'Posts' },
  { key: 'performance', label: 'Desempenho' },
  { key: 'ads', label: 'Anunciar' },
];
const TRAILING_ACTIONS: Array<{ key: string; label: string }> = [
  { key: 'request_reviews', label: 'Solicitar avaliações' },
  { key: 'profiles', label: 'Perfis' },
];
// Ações com painel entregue; as demais aparecem como "Em breve"
const AVAILABLE_ACTIONS = new Set(['edit_profile', 'photos', 'ads', 'profiles']);
const VERIFICATION_GATED = new Set(['reviews', 'posts', 'performance', 'ads', 'request_reviews']);

// Listas iniciais pequenas e revisáveis (gcid da Business Information)
const LODGING_CATEGORY_IDS = new Set(['gcid:hotel', 'gcid:inn', 'gcid:motel', 'gcid:hostel', 'gcid:bed_and_breakfast', 'gcid:resort_hotel', 'gcid:guest_house']);
const FOOD_CATEGORY_IDS = new Set(['gcid:restaurant', 'gcid:bakery', 'gcid:cafe', 'gcid:coffee_shop', 'gcid:pizza_restaurant', 'gcid:bar', 'gcid:snack_bar', 'gcid:ice_cream_shop']);
const RETAIL_CATEGORY_IDS = new Set(['gcid:store', 'gcid:clothing_store', 'gcid:shoe_store', 'gcid:supermarket', 'gcid:pharmacy', 'gcid:pet_store', 'gcid:furniture_store', 'gcid:electronics_store']);

function categoryAction(location: GbpLocation): { key: string; label: string } {
  const categoryId = location.categories?.[0]?.categoryId ?? '';
  const metadata: GbpLocationMetadata = location.metadata ?? {};
  if (metadata.canOperateLodgingData || LODGING_CATEGORY_IDS.has(categoryId)) {
    return { key: 'hotel_details', label: 'Detalhes do hotel' };
  }
  if (metadata.canHaveFoodMenus || FOOD_CATEGORY_IDS.has(categoryId)) return { key: 'menu', label: 'Cardápio' };
  if (RETAIL_CATEGORY_IDS.has(categoryId)) return { key: 'products', label: 'Produtos' };
  return { key: 'services', label: 'Serviços' };
}

/** Grade na ordem do Google; "Editar diárias" e Q&A ficam fora (spec 015). */
export function resolveCategoryActions(location: GbpLocation, verified: boolean): CategoryAction[] {
  const core = (action: { key: string; label: string }): CategoryAction => {
    let status: ActionStatus = AVAILABLE_ACTIONS.has(action.key) ? 'available' : 'coming_soon';
    if (!verified && VERIFICATION_GATED.has(action.key)) status = 'requires_verification';
    return { ...action, kind: 'core', status };
  };
  const category = categoryAction(location);
  return [
    ...CORE_ACTIONS.map(core),
    { ...category, kind: 'category', status: 'external', externalUrl: GOOGLE_BUSINESS_URL },
    ...TRAILING_ACTIONS.map(core),
  ];
}

export function categoryTab(location: GbpLocation): 'menu' | 'products' | 'services' | null {
  const { key } = categoryAction(location);
  if (key === 'menu' || key === 'products' || key === 'services') return key;
  return null;
}

// ---------- Sugestões (carrossel) ----------

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  cta: { label: string; action: string };
}

export interface SuggestionContext {
  verified: boolean;
  strength: StrengthReport;
  hasAdsCampaign: boolean;
}

/** Ids estáveis; ordem: verificar → completar → anunciar. */
export function buildSuggestions(ctx: SuggestionContext): Suggestion[] {
  const suggestions: Suggestion[] = [];
  if (!ctx.verified) {
    suggestions.push({
      id: 'verify_profile',
      title: 'Verifique sua empresa',
      description: 'Conclua a verificação para gerenciar o perfil e aparecer na Pesquisa e no Maps.',
      cta: { label: 'Verificar', action: 'edit_profile' },
    });
  }
  if (!ctx.strength.complete) {
    suggestions.push({
      id: 'complete_profile',
      title: 'Ajudar os clientes a encontrar sua empresa',
      description: 'Complete o Perfil da Empresa para aumentar a visibilidade na Pesquisa e no Maps.',
      cta: { label: 'Completar perfil', action: 'edit_profile' },
    });
  }
  if (ctx.verified && !ctx.hasAdsCampaign) {
    suggestions.push({
      id: 'create_ad',
      title: 'Criar anúncio',
      description: 'Promova sua empresa com um anúncio no Google.',
      cta: { label: 'Criar anúncio', action: 'ads' },
    });
  }
  return suggestions;
}

// ---------- Formatação e links ----------

/** Linha única pt-BR: "Av. Paulista, 1000, São Paulo - SP, 01310-100". */
export function formatAddress(address: GbpAddress | undefined): string {
  if (!address) return '';
  const street = (address.addressLines ?? []).map((l) => l.trim()).filter(Boolean).join(', ');
  const cityState = [address.locality?.trim(), address.administrativeArea?.trim()].filter(Boolean).join(' - ');
  return [street, cityState, address.postalCode?.trim()].filter(Boolean).join(', ');
}

/** Só http(s) sem credenciais embutidas; bloqueia javascript:, data: etc. */
export function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Como safeHttpUrl, mas só https (fotos: evita mixed content). */
export function safeHttpsUrl(value: string | undefined): string | null {
  const safe = safeHttpUrl(value);
  return safe?.startsWith('https:') ? safe : null;
}

// Hosts exatos de Maps/avaliações; exclui sites./docs. (conteúdo de terceiros)
const GOOGLE_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'search.google.com',
  'google.com.br',
  'www.google.com.br',
  'maps.google.com.br',
  'maps.app.goo.gl',
  'goo.gl',
  'g.page',
]);

/** https em host de Maps/avaliação do Google, sem porta. */
export function safeGoogleUrl(value: string | undefined): string | null {
  const safe = safeHttpsUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  return !url.port && GOOGLE_HOSTS.has(url.hostname.toLowerCase()) ? safe : null;
}

/** Link "Escrever avaliação": newReviewUri do Google ou montado pelo placeId. */
export function buildReviewLink(metadata: GbpLocationMetadata | undefined): string | null {
  const fromGoogle = safeGoogleUrl(metadata?.newReviewUri);
  if (fromGoogle) return fromGoogle;
  if (!metadata?.placeId) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(metadata.placeId)}`;
}
