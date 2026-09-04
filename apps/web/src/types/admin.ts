export type DashboardPeriod = '7d' | '30d' | '90d';

export interface AdminDashboardStats {
  mrrCents: number;
  activeClients: number;
  newClients: number;
  activeTrials: number;
  cancellations: number;
  plans: Array<{ planId: string; name: string; priceCents: number; interval: string; clients: number }>;
  recentActivity: Array<{ tipo: 'novo' | 'trial' | 'plano' | 'cancelamento'; tenantName: string; description: string; at: string }>;
}