export function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Gestão de Usuários</h1>
        <p className="text-sm text-zinc-500 mt-2">
          Administre usuários de todos os tenants no sistema FURY.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-800 mb-4">
            <span className="text-2xl">👥</span>
          </div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-2">Em Construção</h2>
          <p className="text-sm text-zinc-400">
            A gestão de usuários será implementada em breve.
          </p>
        </div>
      </div>
    </div>
  );
}
