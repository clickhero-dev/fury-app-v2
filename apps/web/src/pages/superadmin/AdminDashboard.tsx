import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import type { AdminDashboardStats, DashboardPeriod } from '../../types/admin';
import { formatBRL, planColor } from './adminDashboard.utils';

const ATIVIDADE_CORES: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
  novo: {
    bg: 'rgba(34,197,94,0.12)', color: '#22C55E',
    icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  },
  trial: {
    bg: 'rgba(207,111,3,0.12)', color: '#CF6F03',
    icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  },
  cancelamento: {
    bg: 'rgba(192,57,43,0.12)', color: '#C0392B',
    icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  },
  plano: {
    bg: 'rgba(30,136,168,0.12)', color: '#1E88A8',
    icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 21 7 17 3"/><line x1="21" y1="7" x2="9" y2="7"/><polyline points="7 21 3 17 7 13"/><line x1="15" y1="17" x2="3" y2="17"/></svg>,
  },
};

const periodos: { id: DashboardPeriod; label: string }[] = [
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: '90d', label: 'Últimos 90 dias' },
];

const cardStyle: React.CSSProperties = { background: '#161714', border: '1px solid #2A2D27', borderRadius: 12, padding: '18px 20px' };

export function DashboardAdminPage() {
  const [periodo, setPeriodo] = useState<DashboardPeriod>('30d');
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get('/admin/dashboard', { params: { period: periodo } })
      .then((r) => setStats(r.data.data))
      .catch(() => setError('Não foi possível carregar os dados do dashboard.'))
      .finally(() => setLoading(false));
  }, [periodo]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ ...cardStyle, padding: 40, color: '#5A605C', fontSize: 13 }}>
        Carregando dados…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, padding: 40, color: '#B0B6B2', fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>{error}</span>
        <button
          onClick={load}
          style={{
            padding: '6px 14px', borderRadius: 7, border: '1px solid #2A2D27', background: '#1E201C',
            color: '#1E88A8', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ ...cardStyle, padding: 40, color: '#5A605C', fontSize: 13 }}>
        Nenhum dado ainda — crie tenants e assinaturas para ver o dashboard.
      </div>
    );
  }

  const total = stats.plans.reduce((s, p) => s + p.clients, 0);

  const kpis = [
    {
      label: 'MRR', value: formatBRL(stats.mrrCents), sub: 'receita mensal recorrente', color: '#22C55E',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    },
    {
      label: 'Clientes Ativos', value: String(stats.activeClients), sub: 'com assinatura ativa', color: '#1E88A8',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
    {
      label: 'Novos', value: String(stats.newClients), sub: 'no período', color: '#1E88A8',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
    },
    {
      label: 'Trials Ativos', value: String(stats.activeTrials), sub: 'em período de teste', color: '#CF6F03',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
    {
      label: 'Cancelamentos', value: String(stats.cancellations), sub: 'no período', color: '#C0392B',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
    },
  ];

  return (
    <div className="space-y-6">

    {/* Header */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'rgba(30,136,168,0.1)',
          border: '1px solid rgba(30,136,168,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#1E88A8', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold !text-[#ECEDEF]" style={{ margin: 0, letterSpacing: '-0.5px' }}>Dashboard</h1>
        </div>
      </div>

      <span style={{ fontSize: 13, color: '#5A605C', position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
        Visão geral do sistema
      </span>

      {/* Filtro de período */}
      <div style={{ display: 'flex', gap: 4, background: '#161714', border: '1px solid #2A2D27', borderRadius: 10, padding: 4 }}>
        {periodos.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            style={{
              padding: '6px 14px', borderRadius: 7, border: 'none',
              fontSize: 12.5,
              fontWeight: periodo === p.id ? 600 : 400,
              color: periodo === p.id ? '#1E88A8' : '#5A605C',
              background: periodo === p.id ? 'rgba(30,136,168,0.12)' : 'transparent',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { if (periodo !== p.id) (e.currentTarget as HTMLButtonElement).style.color = '#B0B6B2'; }}
            onMouseLeave={(e) => { if (periodo !== p.id) (e.currentTarget as HTMLButtonElement).style.color = '#5A605C'; }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>

    {/* KPI cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
      {kpis.map((kpi) => (
        <div key={kpi.label} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: '#5A605C', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{kpi.label}</span>
            <span style={{ color: kpi.color, opacity: 0.8 }}>{kpi.icon}</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#ECEDEF', letterSpacing: '-0.5px', marginBottom: 4 }}>{kpi.value}</div>
          <div style={{ fontSize: 11, color: '#3E4440' }}>{kpi.sub}</div>
        </div>
      ))}
    </div>

    {/* Bottom row */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>

      {/* Distribuição por plano */}
      <div style={{ ...cardStyle, padding: '20px 24px' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#ECEDEF', margin: '0 0 20px', letterSpacing: '-0.2px' }}>Distribuição por Plano</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {stats.plans.map((p, i) => {
            const pct = total > 0 ? Math.round((p.clients / total) * 100) : 0;
            return (
              <div key={p.planId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: planColor(p.name, i), display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#B0B6B2' }}>{p.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11, color: '#5A605C' }}>{formatBRL(p.priceCents)}{p.interval === 'yearly' ? '/ano' : '/mês'}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#ECEDEF', minWidth: 20, textAlign: 'right' }}>{p.clients}</span>
                  </div>
                </div>
                <div style={{ height: 4, background: '#1E201C', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: planColor(p.name, i), borderRadius: 2, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            );
          })}
          {stats.plans.length === 0 && (
            <div style={{ fontSize: 13, color: '#5A605C' }}>Nenhuma assinatura ativa ainda.</div>
          )}
        </div>
      </div>

      {/* Atividade recente */}
      <div style={{ ...cardStyle, padding: '20px 24px' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#ECEDEF', margin: '0 0 16px', letterSpacing: '-0.2px' }}>Atividade Recente</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {stats.recentActivity.map((a, i) => {
            const s = ATIVIDADE_CORES[a.tipo];
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0',
                  borderBottom: i < stats.recentActivity.length - 1 ? '1px solid #1A1C18' : 'none',
                }}
              >
                <span style={{ width: 24, height: 24, borderRadius: 6, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {s.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#ECEDEF' }}>{a.tenantName}</span>
                  <span style={{ fontSize: 13, color: '#7E8480' }}> {a.description}</span>
                </div>
                <span style={{ fontSize: 11, color: '#3E4440', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {new Date(a.at).toLocaleDateString('pt-BR')}
                </span>
              </div>
            );
          })}
          {stats.recentActivity.length === 0 && (
            <div style={{ fontSize: 13, color: '#5A605C' }}>Sem atividade no período.</div>
          )}
        </div>
      </div>

    </div>
    </div>
  );
}