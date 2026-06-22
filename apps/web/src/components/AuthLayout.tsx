interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout de tela cheia para páginas de autenticação (Login e Cadastro).
 *
 * Estrutura em duas colunas no desktop:
 * - **Esquerda (oculta no mobile):** branding premium com logo animado, headline,
 *   lista de features e métricas de impacto (400+ clientes, 24/7, ROAS 3-5x).
 * - **Direita:** card de formulário com fundo escuro e borda laranja,
 *   onde o conteúdo filho (`children`) é renderizado.
 *
 * No mobile, apenas o lado direito é exibido com logo centralizado acima do card.
 *
 * Background: grade SVG sutil sobre fundo `#0A0A0A` com efeito de glow laranja
 * animado na área do logo (lado esquerdo).
 *
 * @example
 * // Usado nas páginas de login e cadastro
 * export function LoginPage() {
 *   return (
 *     <AuthLayout>
 *       <LoginForm />
 *     </AuthLayout>
 *   );
 * }
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-2 min-h-screen bg-[#0A0A0A]">
      {/* Grade SVG de fundo */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIE0gMCA2MCBMIDAgMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-60" />
      </div>

      {/* Lado esquerdo — branding (apenas desktop) */}
      <div className="hidden lg:flex relative flex-col items-start justify-center px-16 py-24 space-y-16">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-[#FF6B35]/10 rounded-full blur-3xl opacity-15 pointer-events-none animate-pulse" style={{animationDuration: '4s'}} />

        <div className="relative space-y-12 z-10">
          {/* Logo com glow cinematográfico */}
          <div className="relative w-fit">
            <div className="absolute -inset-8 bg-[#FF6B35] rounded-full blur-2xl opacity-70 animate-pulse" style={{animationDuration: '3s'}} />
            <div className="absolute -inset-4 bg-[#FF6B35]/50 rounded-full blur-xl opacity-50" />
            <div className="relative inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#E84C0E] text-white shadow-2xl">
              <span className="text-7xl font-black">F</span>
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-6">
            <h1 className="text-9xl font-black text-white leading-none tracking-tighter" style={{letterSpacing: '-0.02em'}}>FURY</h1>
            <div className="space-y-2">
              <p className="text-3xl font-black text-[#FF6B35] uppercase tracking-wide">AUTOMAÇÃO DE TRÁFEGO PAGO</p>
              <p className="text-2xl font-bold text-white">POWERED BY AI</p>
            </div>
          </div>

          <p className="text-lg text-zinc-200 font-medium leading-relaxed max-w-md">Automação inteligente de campanhas com resultados em tempo real. IA avançada que otimiza 24/7.</p>

          {/* Lista de features */}
          <div className="space-y-5 pt-6">
            {[
              { title: 'Automação Inteligente', desc: 'Campanhas otimizadas automaticamente' },
              { title: 'Resultados em Tempo Real', desc: 'Dashboard ao vivo com métricas' },
              { title: 'ROAS 3-5x Melhor', desc: 'Resultado comprovado em escala' },
            ].map((feature) => (
              <div key={feature.title} className="flex gap-4 items-start group">
                <div className="flex-shrink-0 mt-1">
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[#FF6B35] text-white">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a11 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">{feature.title}</h3>
                  <p className="text-zinc-400 mt-0.5 text-sm">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-3 gap-8 pt-12 border-t border-[#FF6B35]/20">
            {[
              { value: '+400', label: 'Clientes' },
              { value: '24/7', label: 'Operação' },
              { value: '3-5x', label: 'ROAS' },
            ].map((m) => (
              <div key={m.label} className="space-y-2">
                <p className="text-4xl font-black text-[#FF6B35]">{m.value}</p>
                <p className="text-xs text-zinc-300 uppercase tracking-wider font-bold">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lado direito — formulário */}
      <div className="relative flex flex-col items-center justify-center px-6 py-12 sm:px-8 lg:px-16">
        <div className="w-full max-w-md space-y-8">
          {/* Logo mobile */}
          <div className="lg:hidden flex flex-col items-center gap-6 mb-8">
            <div className="relative w-fit">
              <div className="absolute -inset-6 bg-[#FF6B35] rounded-full blur-2xl opacity-60" />
              <div className="relative inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#E84C0E] text-white shadow-2xl">
                <span className="text-6xl font-black">F</span>
              </div>
            </div>
            <h1 className="text-5xl font-black text-white">FURY</h1>
          </div>

          {/* Card do formulário */}
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