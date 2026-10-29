export type Sprint7Provider = 'google' | 'meta';
export type Sprint7CampaignStatus = 'active' | 'review' | 'paused';

export interface Sprint7DashboardMetrics {
  providerLabel: 'Google' | 'Meta';
  impressions: number;
  clicks: number;
  spendBrl: number;
  changePercent: number;
  periodLabel: string;
}

export interface Sprint7Campaign {
  id: string;
  provider: Sprint7Provider;
  name: string;
  status: Sprint7CampaignStatus;
  objective: string;
  location: string;
  dailyBudgetBrl: number;
  impressions: number;
  clicks: number;
}

export interface Sprint7Review {
  id: string;
  author: string;
  initials: string;
  rating: number;
  dateLabel: string;
  text: string;
  publicReply: string | null;
  internalNote: string | null;
}

export interface Sprint7Photo {
  id: string;
  title: string;
  tone: 'bread' | 'shop' | 'coffee' | 'oven';
}

const dashboardMetrics: Record<Sprint7Provider, Sprint7DashboardMetrics> = {
  google: {
    providerLabel: 'Google',
    impressions: 18_420,
    clicks: 1_286,
    spendBrl: 684.2,
    changePercent: 12.4,
    periodLabel: 'Últimos 30 dias · dados demonstrativos',
  },
  meta: {
    providerLabel: 'Meta',
    impressions: 24_680,
    clicks: 1_942,
    spendBrl: 912.5,
    changePercent: 8.2,
    periodLabel: 'Últimos 30 dias · dados demonstrativos',
  },
};

const campaigns: Record<Sprint7Provider, Sprint7Campaign[]> = {
  google: [
    { id: 'g-demo-1', provider: 'google', name: 'Padaria perto de você', status: 'active', objective: 'Pesquisa', location: 'São Paulo, SP', dailyBudgetBrl: 18.5, impressions: 4_820, clicks: 386 },
    { id: 'g-demo-2', provider: 'google', name: 'Encomende seu bolo', status: 'review', objective: 'Pesquisa', location: 'São Paulo, SP', dailyBudgetBrl: 12, impressions: 0, clicks: 0 },
    { id: 'g-demo-3', provider: 'google', name: 'Café da manhã completo', status: 'paused', objective: 'Pesquisa', location: 'São Paulo, SP', dailyBudgetBrl: 10, impressions: 2_140, clicks: 214 },
  ],
  meta: [
    { id: 'm-demo-1', provider: 'meta', name: 'Alcance no bairro', status: 'active', objective: 'Alcance', location: 'São Paulo, SP', dailyBudgetBrl: 22, impressions: 7_360, clicks: 592 },
    { id: 'm-demo-2', provider: 'meta', name: 'Novidades da padaria', status: 'paused', objective: 'Engajamento', location: 'São Paulo, SP', dailyBudgetBrl: 15, impressions: 5_100, clicks: 403 },
  ],
};

export const sprint7MockReviews: Sprint7Review[] = [
  {
    id: 'review-1', author: 'Mariana S.', initials: 'MS', rating: 5, dateLabel: 'há 2 dias',
    text: 'Ótimo atendimento e pão quentinho! Virei cliente fiel.', publicReply: null,
    internalNote: 'Agradecer pela visita e convidar para conhecer os pães artesanais.',
  },
  {
    id: 'review-2', author: 'Rafael M.', initials: 'RM', rating: 4, dateLabel: 'há 5 dias',
    text: 'Produtos muito bons, só achei a fila um pouco demorada.', publicReply: null,
    internalNote: null,
  },
  {
    id: 'review-3', author: 'Camila R.', initials: 'CR', rating: 5, dateLabel: 'há 1 semana',
    text: 'Melhor pão de queijo do bairro. Recomendo!',
    publicReply: 'Muito obrigado, Camila! Ficamos felizes que tenha gostado.', internalNote: null,
  },
];

export const sprint7MockPhotos: Sprint7Photo[] = [
  { id: 'photo-1', title: 'Pães artesanais · Capa', tone: 'bread' },
  { id: 'photo-2', title: 'Ambiente da loja', tone: 'shop' },
  { id: 'photo-3', title: 'Café da manhã', tone: 'coffee' },
  { id: 'photo-4', title: 'Fornada de hoje', tone: 'oven' },
];

export function getSprint7DashboardMetrics(provider: Sprint7Provider): Sprint7DashboardMetrics {
  return { ...dashboardMetrics[provider] };
}

export function getSprint7Campaigns(provider: Sprint7Provider): Sprint7Campaign[] {
  return campaigns[provider].map((campaign) => ({ ...campaign }));
}
