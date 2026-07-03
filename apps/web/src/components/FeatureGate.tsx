import { useSubscription } from '@/hooks/useBilling';

/**
 * Mapa de features para o nível mínimo de plano necessário.
 * 0 = Starter, 1 = Pro, 2 = Enterprise
 */
const FEATURE_REQUIRED_LEVEL: Record<string, number> = {
  campaigns_unlimited: 1,
  automation: 1,
  ai_studio: 1,
  advanced_reports: 1,
  api_integrations: 1,
  multi_accounts: 2,
  custom_integrations: 2,
  dedicated_manager: 2,
  priority_support: 2,
};

/** Mapa de nomes de plano para nível numérico. */
const PLAN_LEVEL: Record<string, number> = {
  starter: 0,
  pro: 1,
  enterprise: 2,
};

/** Nome do plano mínimo exibido no tooltip de bloqueio. */
const REQUIRED_PLAN_NAME: Record<number, string> = {
  1: 'Pro',
  2: 'Enterprise',
};

/**
 * Determina o nível numérico do plano a partir do nome retornado pela API.
 * Faz correspondência case-insensitive e por substring.
 *
 * @param planName - Nome do plano (ex: "Pro Monthly", "Enterprise Annual")
 * @returns Nível numérico: 0 (Starter), 1 (Pro), 2 (Enterprise)
 */
function getPlanLevel(planName: string | undefined | null): number {
  if (!planName) return 0;
  const lower = planName.toLowerCase();
  if (lower.includes('enterprise')) return PLAN_LEVEL.enterprise;
  if (lower.includes('pro')) return PLAN_LEVEL.pro;
  return PLAN_LEVEL.starter;
}

interface FeatureGateProps {
  /** Nome da feature a ser verificada (deve estar em `FEATURE_REQUIRED_LEVEL`). */
  featureName: string;
  /** Conteúdo a ser exibido ou bloqueado conforme o plano do tenant. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Componente de controle de acesso por plano de assinatura.
 *
 * Verifica se o plano atual do tenant tem nível suficiente para acessar
 * a feature informada. Se sim, renderiza o conteúdo normalmente.
 * Se não, renderiza o conteúdo com opacidade reduzida e um tooltip
 * indicando qual plano é necessário ao passar o mouse.
 *
 * O bloqueio é apenas visual — não impede chamadas diretas à API.
 *
 * @example
 * // Feature disponível no plano Pro ou superior
 * <FeatureGate featureName="automation">
 *   <AutomationPanel />
 * </FeatureGate>
 *
 * @example
 * // Feature disponível apenas no Enterprise
 * <FeatureGate featureName="dedicated_manager">
 *   <ManagerContact />
 * </FeatureGate>
 */
export function FeatureGate({ featureName, children, className }: FeatureGateProps) {
  const { data: subscription } = useSubscription();

  const requiredLevel = FEATURE_REQUIRED_LEVEL[featureName] ?? 0;
  const currentLevel = getPlanLevel(subscription?.plan?.name);
  const hasAccess = currentLevel >= requiredLevel;

  // Plano suficiente — renderiza o conteúdo normalmente
  if (hasAccess) {
    return <>{children}</>;
  }

  const requiredPlan = REQUIRED_PLAN_NAME[requiredLevel] ?? 'Pro';

  // Plano insuficiente — bloqueia com overlay e tooltip ao hover
  return (
    <div className={`relative group ${className ?? ''}`}>
      {/* Conteúdo bloqueado: sem interação e com opacidade reduzida */}
      <div className="pointer-events-none select-none opacity-40">
        {children}
      </div>
      {/* Overlay com tooltip indicando o plano necessário */}
      <div className="absolute inset-0 flex items-center justify-center cursor-not-allowed rounded-lg">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div className="bg-[#1c1c1e] text-white text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap font-medium border border-white/10">
            Disponível no plano{' '}
            <span className="text-[#EA580C] font-bold">{requiredPlan}</span>
          </div>
        </div>
      </div>
    </div>
  );
}