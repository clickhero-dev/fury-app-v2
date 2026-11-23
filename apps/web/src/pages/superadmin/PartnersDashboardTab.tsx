import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import type { DashboardPeriod } from '../../types/admin';
import { formatBRL, formatYMD } from './adminDashboard.utils';

export interface PartnersDashboard {
  revenueCents: number;
  activePartners: number;
  newPartners: number;
  slotsUsed: number;
  slotsTotal: number;
  partnerClientsActive: number;
  partnerClientsTotal: number;
  partners: {
    id: string;
    name: string;
    paidCents: number | null;
    paidAt: string | null;
    usedTenants: number;
    maxTenants: number;
    activeClients: number;
    aiKeyConfigured: boolean;
  }[];
}

const cardStyle: React.CSSProperties = { background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: '18px 20px' };

// Aba Parceiros do dashboard (só super_admin)
export function PartnersDashboardTab({ period }: { period: DashboardPeriod }) {
  const [data, setData] = useState<PartnersDashboard | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api
      .get('/admin/dashboard/partners', { params: { period } })
      .then((r) => setData(r.data.data))
      .catch((err) => setError(errorMessage(err, 'Não foi possível carregar os dados dos parceiros')));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div role="alert" style={{ ...cardStyle, padding: 40, fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>{error}</span>
        <button type="button" onClick={load} className="ady-btn text-[#17708A] dark:text-[#1E88A8]" style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--admin-border)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          Tentar novamente
        </button>
      </div>
    );
  }
  if (!data) return <div style={{ ...cardStyle, padding: 40, color: 'var(--admin-text-muted)', fontSize: 13 }}>Carregando dados…</div>;

  const pct = data.slotsTotal > 0 ? Math.min(100, Math.round((data.slotsUsed / data.slotsTotal) * 100)) : 0;
  const cards = [
    { label: 'Receita no período', value: formatBRL(data.revenueCents), sub: 'pagamentos únicos de parceiros', color: '#22C55E' },
    { label: 'Parceiros ativos', value: String(data.activePartners), sub: `+${data.newPartners} novo${data.newPartners === 1 ? '' : 's'} no período`, color: '#1E88A8' },
    { label: 'Vagas usadas', value: `${data.slotsUsed} de ${data.slotsTotal}`, sub: 'clientes criados / vagas vendidas', color: '#CF6F03', bar: pct },
    { label: 'Clientes dos parceiros', value: `${data.partnerClientsActive} ativos`, sub: `${data.partnerClientsTotal} no total`, color: '#1E88A8' },
  ];

  return (
    <div className="space-y-6">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {cards.map((c) => (
          <div key={c.label} style={cardStyle}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--admin-text)', letterSpacing: '-0.5px', marginBottom: 4 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-faint)' }}>{c.sub}</div>
            {c.bar !== undefined && (
              <div aria-hidden="true" style={{ height: 6, background: 'var(--admin-surface-2)', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
                <div style={{ height: '100%', width: `${c.bar}%`, background: c.color, borderRadius: 3 }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, padding: '20px 24px' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: '0 0 12px' }}>Parceiros</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: 720 }}>
            <thead>
              <tr className="text-left text-xs uppercase text-text-secondary">
                <th className="py-2 pr-3 font-semibold">Parceiro</th>
                <th className="py-2 pr-3 font-semibold">Total pago</th>
                <th className="py-2 pr-3 font-semibold">Último pagamento</th>
                <th className="py-2 pr-3 font-semibold">Vagas</th>
                <th className="py-2 pr-3 font-semibold">Clientes ativos</th>
                <th className="py-2 font-semibold">Chave de IA</th>
              </tr>
            </thead>
            <tbody>
              {data.partners.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--admin-border)' }}>
                  <td className="py-3 pr-3">
                    <Link to={`/admin/parceiros/${p.id}`} className="font-semibold text-[#17708A] dark:text-[#1E88A8] hover:underline">{p.name}</Link>
                  </td>
                  <td className="py-3 pr-3 font-semibold text-text-primary">{p.paidCents === null ? '—' : formatBRL(p.paidCents)}</td>
                  <td className="py-3 pr-3 text-text-secondary">{p.paidAt ? formatYMD(p.paidAt) : '—'}</td>
                  <td className="py-3 pr-3 text-text-secondary">{p.usedTenants} de {p.maxTenants}</td>
                  <td className="py-3 pr-3 text-text-secondary">{p.activeClients}</td>
                  <td className="py-3">
                    {p.aiKeyConfigured ? (
                      <strong className="inline-block rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">Configurada</strong>
                    ) : (
                      <strong className="inline-block rounded-full bg-spark/15 px-2.5 py-1 text-xs font-semibold text-[#B55F02] dark:text-spark">Sem chave: clientes sem IA</strong>
                    )}
                  </td>
                </tr>
              ))}
              {data.partners.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-text-secondary">Nenhum parceiro cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
