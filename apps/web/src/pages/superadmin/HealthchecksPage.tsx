import { Activity, CheckCircle2, CircleAlert, CircleX, Clock3, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';

interface HealthcheckUser {
  userId: string;
  name: string | null;
  email: string;
  tenantId: string;
  tenantName: string | null;
  connectionId: string | null;
  adAccountId: string | null;
  instagramUserId: string | null;
  status: 'success' | 'partial' | 'failed' | null;
  checkedAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
}

interface CheckResult {
  status: 'success' | 'failed' | 'not_applicable';
  code?: string;
  reason?: string;
}

interface HealthcheckResult {
  tenantId: string;
  checkedAt: string;
  status: 'success' | 'partial' | 'failed';
  checks: Record<string, CheckResult>;
  lastSync?: { startedAt: string; status: string } | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
}

const PAGE_SIZE = 9;
const labels: Record<string, string> = {
  connection: 'Conexão Meta',
  token: 'Token',
  metaBlocked: 'Bloqueio da Meta',
  instagramPublish: 'Publicação no Instagram',
  leadFormCampaigns: 'Formulário de leads',
  metrics: 'Leitura de métricas',
};

function statusLabel(status?: string | null) {
  if (status === 'success') return 'Saudável';
  if (status === 'failed') return 'Falha';
  if (status === 'partial') return 'Parcial';
  return 'Não validado';
}

function statusIcon(status?: string | null, className = 'h-5 w-5') {
  if (status === 'success') return <CheckCircle2 className={`${className} text-emerald-400`} aria-hidden="true" />;
  if (status === 'failed') return <CircleX className={`${className} text-red-400`} aria-hidden="true" />;
  if (status === 'partial') return <CircleAlert className={`${className} text-amber-300`} aria-hidden="true" />;
  return <Clock3 className={`${className} text-slate-400`} aria-hidden="true" />;
}

function cardStyle(status?: string | null) {
  if (status === 'success') return 'border-emerald-400/40 bg-emerald-500/[0.06] hover:border-emerald-300/60';
  if (status === 'failed') return 'border-red-400/40 bg-red-500/[0.06] hover:border-red-300/60';
  if (status === 'partial') return 'border-amber-400/40 bg-amber-500/[0.06] hover:border-amber-300/60';
  return 'border-slate-500/40 bg-slate-500/[0.05] hover:border-slate-400/60';
}

function dateLabel(value?: string | null) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

export function HealthchecksPage() {
  const [users, setUsers] = useState<HealthcheckUser[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<HealthcheckUser | null>(null);
  const [result, setResult] = useState<HealthcheckResult | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingResult, setLoadingResult] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const response = await api.get('/admin/healthchecks/users');
      const rows = (response.data?.data ?? []) as HealthcheckUser[];
      setUsers(rows);
      setSelectedUser((current) => current ? rows.find((row) => row.userId === current.userId) ?? current : null);
    } catch {
      setError('Não foi possível carregar os usuários e integrações Meta.');
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    if (!query) return users;
    return users.filter((user) => [user.name, user.email, user.tenantName, user.tenantId]
      .some((value) => value?.toLocaleLowerCase('pt-BR').includes(query)));
  }, [search, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openDetails = async (user: HealthcheckUser) => {
    setSelectedUser(user);
    setResult(null);
    setError(null);
    setLoadingResult(true);
    try {
      const response = await api.get(`/admin/healthchecks?userId=${encodeURIComponent(user.userId)}`);
      setResult(response.data?.data?.result ?? null);
    } catch {
      setError('Não foi possível carregar o último healthcheck. Tente novamente.');
    } finally {
      setLoadingResult(false);
    }
  };

  const closeDetails = () => {
    if (running) return;
    setSelectedUser(null);
    setResult(null);
    setError(null);
  };

  useEffect(() => {
    if (!selectedUser) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeDetails(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedUser, running]);

  const runHealthcheck = async () => {
    if (!selectedUser || running) return;
    setRunning(true);
    setError(null);
    try {
      const response = await api.post('/admin/healthchecks/run', { userId: selectedUser.userId });
      setResult(response.data?.data ?? null);
      void loadUsers();
    } catch {
      setError('Não foi possível executar o healthcheck agora. Tente novamente.');
    } finally {
      setRunning(false);
    }
  };

  const lastSyncAt = result?.lastSync?.startedAt ?? result?.lastSyncAt ?? selectedUser?.lastSyncAt;
  const lastSyncStatus = result?.lastSync?.status ?? result?.lastSyncStatus ?? selectedUser?.lastSyncStatus;

  return <div className="max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-1 rounded-lg border border-[#1E88A8]/30 bg-[#1E88A8]/10 p-2 text-[#5cc5e4]"><Activity className="h-5 w-5" /></span>
        <div><h1 className="text-2xl font-bold">Healthchecks</h1><p className="mt-1 text-sm text-[#8A8F8B]">Diagnóstico das conexões e permissões da Meta.</p></div>
      </div>
      <button type="button" onClick={() => void loadUsers()} disabled={loadingUsers} className="inline-flex items-center gap-2 rounded-lg border border-[#2A2D27] px-3 py-2 text-sm disabled:opacity-60">
        <RefreshCw className="h-4 w-4" /> Atualizar lista
      </button>
    </header>

    {error && !selectedUser && <div role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>}

    <section className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8F8B]" aria-hidden="true" />
        <input aria-label="Pesquisar usuários" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Pesquisar por usuário, email ou tenant…" className="w-full rounded-lg border border-[#2A2D27] bg-[#161714] py-3 pl-10 pr-4 text-sm text-[#ECEDEF] outline-none placeholder:text-[#777C77] focus:border-[#1E88A8]" />
      </div>

      {loadingUsers ? <div className="rounded-xl border border-[#2A2D27] bg-[#161714] p-8 text-center text-sm text-[#8A8F8B]">Carregando usuários…</div>
        : pageUsers.length === 0 ? <div className="rounded-xl border border-[#2A2D27] bg-[#161714] p-8 text-center text-sm text-[#8A8F8B]">{users.length === 0 ? 'Nenhum usuário com integração Meta encontrado.' : 'Nenhum usuário corresponde à pesquisa.'}</div>
          : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pageUsers.map((user) => {
              const name = user.name || user.email;
              const tenant = user.tenantName || user.tenantId;
              const health = statusLabel(user.status);
              return <button key={user.userId} type="button" onClick={() => void openDetails(user)} aria-label={`${name} · ${tenant}, saúde ${health.toLocaleLowerCase('pt-BR')}`} className={`group min-h-36 rounded-xl border p-4 text-left transition hover:-translate-y-0.5 ${cardStyle(user.status)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-semibold">{name}</p><p className="mt-1 truncate text-xs text-[#A1A6A1]">{tenant}</p><p className="mt-1 truncate text-xs text-[#777C77]">{user.email}</p></div>
                  {statusIcon(user.status, 'h-6 w-6 shrink-0')}
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                  <span className="text-sm font-medium">{health}</span>
                  <span className="text-[11px] text-[#8A8F8B]">{user.checkedAt ? dateLabel(user.checkedAt) : 'Sem validação'}</span>
                </div>
                <span className="sr-only">Abrir detalhes</span>
              </button>;
            })}
          </div>}

      {!loadingUsers && filteredUsers.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#8A8F8B]">
        <span>{filteredUsers.length} {filteredUsers.length === 1 ? 'resultado' : 'resultados'}</span>
        <div className="flex items-center gap-3"><span>Página {currentPage} de {totalPages}</span>
          <button type="button" aria-label="Página anterior" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} className="rounded-md border border-[#2A2D27] px-3 py-1.5 disabled:opacity-40">Anterior</button>
          <button type="button" aria-label="Próxima página" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages} className="rounded-md border border-[#2A2D27] px-3 py-1.5 disabled:opacity-40">Próxima página</button>
        </div>
      </div>}
    </section>

    {selectedUser && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetails(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="healthcheck-dialog-title" className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#2A2D27] bg-[#11120E] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#2A2D27] bg-[#11120E] px-5 py-4">
          <div className="min-w-0"><h2 id="healthcheck-dialog-title" className="text-lg font-semibold">Healthcheck da Meta · {selectedUser.name || selectedUser.email}</h2><p className="mt-1 truncate text-xs text-[#8A8F8B]">{selectedUser.tenantName || selectedUser.tenantId} · {selectedUser.email}</p></div>
          <button type="button" aria-label="Fechar detalhes" onClick={closeDetails} disabled={running} className="rounded-md p-1 text-[#8A8F8B] hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-4 p-5">
          {error && <div role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}
          {loadingResult ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#8A8F8B]"><LoaderCircle className="h-4 w-4 animate-spin" /> Carregando resultado…</div>
            : result ? <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#2A2D27] bg-[#161714] p-4"><p className="text-xs text-[#8A8F8B]">Resultado geral</p><div className="mt-1 flex items-center gap-2">{statusIcon(result.status, 'h-4 w-4')}<p className="text-lg font-semibold">{statusLabel(result.status)}</p></div></div>
                <div className="rounded-xl border border-[#2A2D27] bg-[#161714] p-4"><p className="text-xs text-[#8A8F8B]">Última validação</p><p className="mt-1 text-sm font-medium">{dateLabel(result.checkedAt)}</p></div>
                <div className="rounded-xl border border-[#2A2D27] bg-[#161714] p-4"><p className="text-xs text-[#8A8F8B]">Última sincronização</p><p className="mt-1 text-sm font-medium">{lastSyncStatus ? `Sincronização ${lastSyncStatus === 'success' ? 'completa' : lastSyncStatus === 'partial' ? 'parcial' : 'falhou'}` : 'Sem sincronização registrada'}</p><p className="mt-1 text-xs text-[#8A8F8B]">{dateLabel(lastSyncAt)}</p></div>
              </div>
              <div className="overflow-hidden rounded-xl border border-[#2A2D27] bg-[#161714]">
                <div className="border-b border-[#2A2D27] px-5 py-4"><h3 className="font-semibold">Validações da integração Meta</h3><p className="mt-1 text-xs text-[#8A8F8B]">Atualizado em {dateLabel(result.checkedAt)}</p></div>
                <div className="divide-y divide-[#2A2D27]">
                  {Object.entries(labels).map(([key, label]) => {
                    const check = result.checks?.[key] ?? { status: 'not_applicable' as const };
                    return <div key={key} className="flex items-start gap-3 px-5 py-4">
                      {statusIcon(check.status, 'h-4 w-4')}
                      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="mt-0.5 text-xs text-[#8A8F8B]">{check.reason ?? statusLabel(check.status)}</p></div>
                      <span className={`shrink-0 text-xs ${check.status === 'success' ? 'text-emerald-300' : check.status === 'failed' ? 'text-red-300' : 'text-amber-200'}`}>{statusLabel(check.status)}</span>
                    </div>;
                  })}
                </div>
              </div>
            </> : !error && <div className="rounded-xl border border-[#2A2D27] bg-[#161714] p-5 text-sm text-[#A1A6A1]">{selectedUser.connectionId ? 'Nenhum healthcheck executado para esta conexão.' : 'Este tenant ainda não tem uma conexão Meta.'}</div>}

          <footer className="flex flex-wrap justify-end gap-2 border-t border-[#2A2D27] pt-4">
            <button type="button" onClick={closeDetails} disabled={running} className="rounded-lg border border-[#2A2D27] px-4 py-2.5 text-sm disabled:opacity-50">Fechar</button>
            <button type="button" onClick={() => void runHealthcheck()} disabled={running || loadingResult} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1E88A8] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {running ? 'Executando…' : 'Executar healthcheck'}
            </button>
          </footer>
        </div>
      </section>
    </div>}
  </div>;
}
