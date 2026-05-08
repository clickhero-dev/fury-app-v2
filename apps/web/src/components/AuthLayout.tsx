interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen bg-white">
      {/* Left Side - Premium Branding */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-gradient-to-br from-[#F6F8FA] via-white to-[#F6F8FA] px-12 py-16 space-y-12">
        <div className="space-y-8 max-w-sm">
          {/* Logo Icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-[#E8631A] text-white shadow-2xl">
            <span className="text-4xl font-black">F</span>
          </div>

          {/* Branding Text */}
          <div className="space-y-4">
            <h1 className="text-5xl font-black text-[#1C1C1E] leading-tight">FURY</h1>
            <p className="text-xl text-[#6E7681] font-semibold">Automação de tráfego pago powered by AI</p>
          </div>

          {/* Features List */}
          <div className="space-y-6 pt-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-[#E8631A] text-white">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1E]">Automação Inteligente</h3>
                <p className="text-[#6E7681] mt-1">Campanhas otimizadas 24/7 com IA</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-[#E8631A] text-white">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1E]">Resultados em Tempo Real</h3>
                <p className="text-[#6E7681] mt-1">Acompanhe métricas ao vivo</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-[#E8631A] text-white">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1E]">ROAS 3-5x Melhor</h3>
                <p className="text-[#6E7681] mt-1">Resultados comprovados em múltiplas indústrias</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex flex-col items-center justify-center px-6 py-12 sm:px-8 lg:px-12">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#E8631A] text-white">
              <span className="text-3xl font-black">F</span>
            </div>
          </div>

          {/* Form Content */}
          {children}
        </div>
      </div>
    </div>
  );
}
