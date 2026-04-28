interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen bg-white">
      {/* Left side - Branding */}
      <div className="hidden md:flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-white px-8 py-12 border-r border-gray-100">
        <div className="text-center max-w-sm space-y-8">
          <div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-4">
              FURY
            </h1>
            <p className="text-lg text-gray-600 font-medium">A IA trabalha para você</p>
          </div>
          <div className="space-y-4 text-left border-l-2 border-gray-200 pl-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Automação Inteligente</p>
              <p className="text-sm text-gray-600">Campanhas otimizadas automaticamente</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Em Tempo Real</p>
              <p className="text-sm text-gray-600">Acompanhe resultados ao vivo</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex flex-col items-center justify-center px-6 py-12 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          {children}
        </div>
      </div>
    </div>
  );
}
