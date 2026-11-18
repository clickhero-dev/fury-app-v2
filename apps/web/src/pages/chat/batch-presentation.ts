import { z } from 'zod';

export type BatchMedia = { kind: 'image' | 'video'; url: string };
const labels: Record<string, string> = {
  name:'Nome',caption:'Legenda',prompt:'Descrição',platform:'Canal',postType:'Formato',post_type:'Formato',format:'Formato',
  scheduledAt:'Agendamento',scheduled_at:'Agendamento',date:'Data',objective:'Objetivo',
  dailyBudget:'Orçamento',lifetimeBudget:'Orçamento',daily_budget_cents:'Orçamento',currency:'Moeda',
  adAccountId:'Conta de anúncios',ad_account_id:'Conta de anúncios',adAccountName:'Conta de anúncios',accountName:'Conta de anúncios',
  campaignId:'Campanha',campaign_id:'Campanha',campaignName:'Campanha',adId:'Anúncio',status:'Status',
  duration:'Duração',feedback:'Ajuste',atual:'Valores atuais',alterações:'Alterações propostas',observação:'Observação',
};
const technicalLabels: Record<string,string> = {
  model:'Modelo',version:'Versão',aspectRatio:'Proporção',aspect_ratio:'Proporção',resolution:'Resolução',
};
const groups = new Set(['atual','alterações']);
const budgets = new Set(['dailyBudget','lifetimeBudget','daily_budget_cents']);
const mediaFields = new Set(['imageUrl','image_url','image_urls','imageUrls','videoUrl','video_url']);
const objectives: Record<string,string> = {
  OUTCOME_AWARENESS:'Dar visibilidade ao negócio',OUTCOME_TRAFFIC:'Levar pessoas ao site',OUTCOME_ENGAGEMENT:'Gerar interações',
  OUTCOME_LEADS:'Receber contatos de interessados',OUTCOME_APP_PROMOTION:'Divulgar aplicativo',OUTCOME_SALES:'Buscar vendas',
  BRAND_AWARENESS:'Dar visibilidade ao negócio',REACH:'Alcançar mais pessoas',LINK_CLICKS:'Levar pessoas ao site',
  POST_ENGAGEMENT:'Gerar interações',LEAD_GENERATION:'Receber contatos de interessados',MESSAGES:'Receber mensagens',
  CONVERSIONS:'Buscar ações no site',VIDEO_VIEWS:'Obter visualizações do vídeo',
};
const formats: Record<string,string> = {
  REELS:'Vídeo curto (Reels)',REEL:'Vídeo curto (Reels)',STORY:'Story',STORIES:'Stories',FEED:'Publicação no feed',
  CAROUSEL:'Carrossel',IMAGE:'Imagem',SINGLE_IMAGE:'Imagem',VIDEO:'Vídeo',POST:'Publicação',
};
const statuses: Record<string,string> = {
  ACTIVE:'Ativo',PAUSED:'Pausado',ARCHIVED:'Arquivado',DELETED:'Excluído',DRAFT:'Rascunho',
  PENDING:'Pendente',SCHEDULED:'Agendado',PUBLISHED:'Publicado',COMPLETED:'Concluído',CANCELLED:'Cancelado',
  FAILED:'Falhou',PROCESSING:'Em andamento',RUNNING:'Em andamento',
};
function text(value: unknown): string {
  return typeof value === 'boolean' ? value ? 'Sim' : 'Não'
    : typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? String(value) : 'Não informado';
}
function currencyFor(parameters: Record<string,unknown>, inherited?: string): string | undefined {
  if (typeof parameters.currency === 'string') return parameters.currency;
  const actual = parameters.atual;
  return actual && typeof actual === 'object' && !Array.isArray(actual) && typeof (actual as Record<string,unknown>).currency === 'string'
    ? (actual as {currency:string}).currency : inherited;
}
function budget(value: unknown, key: string, currency?: string): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return 'Valor não informado';
  const period = key === 'lifetimeBudget' ? 'no total' : 'por dia';
  return currency === 'BRL'
    ? `${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value / 100)} ${period}`
    : `${value} unidades menores ${period} (moeda não confirmada; valor não convertido)`;
}
function dateText(value: unknown): string {
  if (typeof value !== 'string' || !z.string().datetime({offset:true}).safeParse(value).success) return text(value);
  return `${new Intl.DateTimeFormat('pt-BR',{
    timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',
  }).format(new Date(value))} (horário de São Paulo)`;
}
function readableValue(key: string, value: unknown, currency?: string): string {
  if (budgets.has(key)) return budget(value,key,currency);
  const code = typeof value === 'string' ? value.toUpperCase() : '';
  if (key === 'objective') return objectives[code] ?? 'Objetivo não identificado';
  if (['postType','post_type','format'].includes(key)) return formats[code] ?? 'Formato não identificado';
  if (key === 'status') return statuses[code] ?? 'Status não identificado';
  if (['scheduledAt','scheduled_at','date'].includes(key)) return dateText(value);
  if (key === 'duration' && typeof value === 'number' && Number.isFinite(value) && value >= 0) return `${value} segundos`;
  if (key === 'platform') return ({INSTAGRAM:'Instagram',FACEBOOK:'Facebook',BOTH:'Instagram e Facebook'} as Record<string,string>)[code] ?? text(value);
  return text(value);
}
export function batchDetails(parameters: Record<string, unknown>, depth = 0, inheritedCurrency?: string): string {
  if (depth > 3) return 'Detalhe não disponível.';
  const currency = currencyFor(parameters,inheritedCurrency);
  const lines = Object.entries(parameters).flatMap(([key,value]) => {
    if (technicalLabels[key] || mediaFields.has(key)) return [];
    if (!labels[key]) return ['Detalhe não disponível.'];
    if (groups.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      return [`${labels[key]}: ${batchDetails(value as Record<string,unknown>,depth + 1,currency)}`];
    }
    return [`${labels[key]}: ${readableValue(key,value,currency)}`];
  });
  return [...new Set(lines)].join(' · ');
}
export function batchAdvancedDetails(parameters: Record<string,unknown>, depth = 0): string {
  if (depth > 3) return '';
  return Object.entries(parameters).flatMap(([key,value]) => {
    if (technicalLabels[key]) return [`${technicalLabels[key]}: ${text(value)}`];
    if (groups.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = batchAdvancedDetails(value as Record<string,unknown>,depth + 1);
      return nested ? [`${labels[key]}: ${nested}`] : [];
    }
    return [];
  }).join(' · ');
}
function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || /[\s\p{Cc}]/u.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function batchMedia(parameters: Record<string,unknown>): BatchMedia[] {
  const format=parameters.postType ?? parameters.post_type;
  const singleKind:BatchMedia['kind']=typeof format==='string' && ['REEL','REELS'].includes(format.toUpperCase())?'video':'image';
  const values: {kind:BatchMedia['kind'];value:unknown}[] = [
    ...['imageUrl','image_url'].map(key => ({kind:singleKind,value:parameters[key]})),
    ...['image_urls','imageUrls'].flatMap(key => Array.isArray(parameters[key])
      ? (parameters[key] as unknown[]).map(value => ({kind:'image' as const,value})) : []),
    ...['videoUrl','video_url'].map(key => ({kind:'video' as const,value:parameters[key]})),
  ];
  return values.flatMap(({kind,value}) => { const url=httpsUrl(value); return url ? [{kind,url}] : []; })
    .filter((item,index,items) => items.findIndex(other => other.url === item.url && other.kind === item.kind) === index);
}
