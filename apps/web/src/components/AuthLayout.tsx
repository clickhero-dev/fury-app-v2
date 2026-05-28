interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-2 min-h-screen bg-[#0A0A0A]">
      {/* Grid Background Pattern */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIE0gMCA2MCBMIDAgMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-60" />
      </div>

      {/* Left Side - Premium Branding */}
      <div className="hidden lg:flex relative flex-col items-start justify-center px-16 py-24 space-y-16">
        {/* Glow Background - Cinematographic (Logo only) */}
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-[#FF6B35]/10 rounded-full blur-3xl opacity-15 pointer-events-none animate-pulse" style={{animationDuration: '4s'}} />

        <div className="relative space-y-12 z-10">
          {/* Logo with Cinematic Glow */}
          <div className="relative w-fit">
            <div className="absolute -inset-8 bg-[#FF6B35] rounded-full blur-2xl opacity-70 animate-pulse" style={{animationDuration: '3s'}} />
            <div className="absolute -inset-4 bg-[#FF6B35]/50 rounded-full blur-xl opacity-50" />
            <div className="relative inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#E84C0E] text-white shadow-2xl">
              <span className="text-7xl font-black">F</span>
            </div>
          </div>

          {/* Headline - Massive Impact */}
          <div className="space-y-6">
            <h1 className="text-9xl font-black text-white leading-none tracking-tighter" style={{letterSpacing: '-0.02em'}}>FURY</h1>
            <div className="space-y-2">
              <p className="text-3xl font-black text-[#FF6B35] uppercase tracking-wide">AUTOMAÇÃO DE TRÁFEGO PAGO</p>
              <p className="text-2xl font-bold text-white">POWERED BY AI</p>
            </div>
          </div>

          {/* Subheadline */}
          <p className="text-lg text-zinc-200 font-medium leading-relaxed max-w-md">Automação inteligente de campanhas com resultados em tempo real. IA avançada que otimiza 24/7.</p>

          {/* Features List */}
          <div className="space-y-5 pt-6">
            <div className="flex gap-4 items-start group">
              <div className="flex-shrink-0 mt-1">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[#FF6B35] text-white">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Automação Inteligente</h3>
                <p className="text-zinc-400 mt-0.5 text-sm">Campanhas otimizadas automaticamente</p>
              </div>
            </div>

            <div className="flex gap-4 items-start group">
              <div className="flex-shrink-0 mt-1">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[#FF6B35] text-white">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Resultados em Tempo Real</h3>
                <p className="text-zinc-400 mt-0.5 text-sm">Dashboard ao vivo com métricas</p>
              </div>
            </div>

            <div className="flex gap-4 items-start group">
              <div className="flex-shrink-0 mt-1">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[#FF6B35] text-white">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">ROAS 3-5x Melhor</h3>
                <p className="text-zinc-400 mt-0.5 text-sm">Resultado comprovado em escala</p>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-8 pt-12 border-t border-[#FF6B35]/20">
            <div className="space-y-2">
              <p className="text-4xl font-black text-[#FF6B35]">+400</p>
              <p className="text-xs text-zinc-300 uppercase tracking-wider font-bold">Clientes</p>
            </div>
            <div className="space-y-2">
              <p className="text-4xl font-black text-[#FF6B35]">24/7</p>
              <p className="text-xs text-zinc-300 uppercase tracking-wider font-bold">Operação</p>
            </div>
            <div className="space-y-2">
              <p className="text-4xl font-black text-[#FF6B35]">3-5x</p>
              <p className="text-xs text-zinc-300 uppercase tracking-wider font-bold">ROAS</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="relative flex flex-col items-center justify-center px-6 py-12 sm:px-8 lg:px-16">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center gap-6 mb-8">
            <div className="relative w-fit">
              <div className="absolute -inset-6 bg-[#FF6B35] rounded-full blur-2xl opacity-60" />
              <div className="relative inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#E84C0E] text-white shadow-2xl">
                <span className="text-6xl font-black">F</span>
              </div>
            </div>
            <h1 className="text-5xl font-black text-white">FURY</h1>
          </div>

          {/* Form Card */}
          <div className="relative bg-[#1A1A1E] border border-[#FF6B35]/40 rounded-2xl p-8 shadow-2xl shadow-[#FF6B35]/30 backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF6B35]/8 to-transparent rounded-2xl pointer-events-none" />
            <div className="relative z-10">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
