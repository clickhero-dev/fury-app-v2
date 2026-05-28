interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-2 min-h-screen bg-[#0D0D0D]">
      {/* Grid Background Pattern */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PnBhdGggZD0iTSA2MCAwIEwgMCAwIE0gMCA2MCBMIDAgMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40" />
      </div>

      {/* Left Side - Premium Branding */}
      <div className="hidden lg:flex relative flex-col items-center justify-center px-12 py-16 space-y-12">
        {/* Glow Background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-to-r from-[#EA580C]/15 to-transparent rounded-full blur-3xl opacity-30 pointer-events-none" />

        <div className="relative space-y-10 max-w-sm z-10">
          {/* Logo */}
          <div className="group">
            <div className="relative inline-flex items-center justify-center w-28 h-28 rounded-3xl bg-gradient-to-br from-[#EA580C] to-[#D84C06] text-white shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-[#EA580C]/20 to-transparent rounded-3xl blur-xl group-hover:from-[#EA580C]/30 transition-all duration-300" />
              <span className="relative text-6xl font-black">F</span>
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-4 pt-4">
            <h1 className="text-7xl font-black text-white leading-tight tracking-tighter">FURY</h1>
            <p className="text-2xl font-bold text-[#FF9244]">Automação de tráfego pago powered by AI</p>
          </div>

          {/* Subheadline */}
          <p className="text-base text-zinc-300 font-medium leading-relaxed">Maximize seus resultados com inteligência artificial avançada e automação 24/7</p>

          {/* Features List */}
          <div className="space-y-6 pt-8">
            <div className="flex gap-4 group">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-[#EA580C]/20 border border-[#EA580C]/50 text-[#FF9244] group-hover:border-[#EA580C]/80 group-hover:bg-[#EA580C]/30 transition-all duration-300">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Automação Inteligente</h3>
                <p className="text-zinc-300 mt-1 text-sm">Campanhas otimizadas 24/7 com IA</p>
              </div>
            </div>

            <div className="flex gap-4 group">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-[#EA580C]/20 border border-[#EA580C]/50 text-[#FF9244] group-hover:border-[#EA580C]/80 group-hover:bg-[#EA580C]/30 transition-all duration-300">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Resultados em Tempo Real</h3>
                <p className="text-zinc-300 mt-1 text-sm">Acompanhe métricas ao vivo</p>
              </div>
            </div>

            <div className="flex gap-4 group">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-[#EA580C]/20 border border-[#EA580C]/50 text-[#FF9244] group-hover:border-[#EA580C]/80 group-hover:bg-[#EA580C]/30 transition-all duration-300">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">ROAS 3-5x Melhor</h3>
                <p className="text-zinc-300 mt-1 text-sm">Resultados comprovados em múltiplas indústrias</p>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-4 pt-8 border-t border-[#27272A]">
            <div className="space-y-1">
              <p className="text-2xl font-bold text-[#FF9244]">+400</p>
              <p className="text-xs text-zinc-300 uppercase tracking-wider font-medium">Clientes</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-[#FF9244]">24/7</p>
              <p className="text-xs text-zinc-300 uppercase tracking-wider font-medium">Operação</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-[#FF9244]">3-5x</p>
              <p className="text-xs text-zinc-300 uppercase tracking-wider font-medium">ROAS</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="relative flex flex-col items-center justify-center px-6 py-12 sm:px-8 lg:px-12">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center gap-4 mb-8">
            <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-[#EA580C] to-[#D84C06] text-white shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-[#EA580C]/20 to-transparent rounded-3xl blur-xl" />
              <span className="relative text-5xl font-black">F</span>
            </div>
            <h1 className="text-4xl font-black text-white">FURY</h1>
          </div>

          {/* Form Card */}
          <div className="relative bg-[#18181B] border border-[#EA580C]/30 rounded-2xl p-8 shadow-2xl shadow-[#EA580C]/20">
            {/* Card Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#EA580C]/5 to-transparent rounded-2xl pointer-events-none" />

            <div className="relative z-10">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
