export function AssinaturaVencida() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
          <svg
            className="h-8 w-8 text-warning"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="mb-3 text-2xl font-bold text-white">
          Assinatura Vencida
        </h1>
        <p className="mb-8 text-gray-400">
          Sua assinatura está vencida. Entre em contato com o suporte para
          regularizar seu acesso.
        </p>
        <div className="rounded-lg bg-surface-secondary p-6 text-left">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Canais de atendimento
          </h2>
          <div className="space-y-3 text-sm text-gray-400">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              <span>suporte@fury.app</span>
            </div>
          </div>
        </div>
        <a
          href="/planos"
          className="mt-6 inline-block rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
        >
          Ver planos disponíveis
        </a>
      </div>
    </div>
  );
}
