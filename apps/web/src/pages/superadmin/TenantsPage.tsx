import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, Users, CreditCard } from 'lucide-react';
import api from '@/lib/api';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  userCount: number;
  subscription: {
    status: string;
    currentPeriodEnd: string;
    plan: { name: string } | null;
  } | null;
}

export function TenantsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/tenants').then((res) => {
      setTenants(res.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = tenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="text-zinc-500 text-sm">Carregando...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Tenants</h1>
          <p className="text-sm text-zinc-500 mt-1">{tenants.length} tenants</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tenant..."
            className="w-64 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
          />
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-zinc-500 text-sm">Nenhum tenant encontrado</div>
        )}
        {filtered.map((tenant) => (
          <button
            key={tenant.id}
            onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
            className="text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-zinc-400" />
                </div>
                <div>
                  <div className="font-semibold text-zinc-100">{tenant.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{tenant.slug}</div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Users className="w-3.5 h-3.5" />
                  {tenant.userCount}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <CreditCard className="w-3.5 h-3.5" />
                  {tenant.subscription?.plan?.name ?? 'Sem plano'}
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    tenant.subscription?.status === 'active'
                      ? 'bg-green-900/30 text-green-400'
                      : tenant.subscription?.status === 'trial'
                      ? 'bg-blue-900/30 text-blue-400'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {tenant.subscription?.status ?? 'inactive'}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
