import { Link } from 'react-router-dom';

interface UsageBadgeProps {
  /** Criativos restantes no ciclo atual; null = desconhecido (não renderiza). */
  remaining: number | null;
  /** Total do plano no ciclo; null = total desconhecido (sem barra/%). */
  limit: number | null;
  /** Classes extras para o container (layout do pai decide largura/alinhamento). */
  className?: string;
}

type Tone = 'normal' | 'warning' | 'error';

const TONE_CLASSES: Record<Tone, { wrap: string; bar: string }> = {
  normal: {
    wrap: 'border-[#1E88A8]/25 bg-[#1E88A8]/10 text-[#1E88A8]',
    bar: 'bg-[#1E88A8]',
  },
  warning: {
    wrap: 'border-[#CF6F03]/30 bg-[#CF6F03]/10 text-[#CF6F03]',
    bar: 'bg-[#CF6F03]',
  },
  error: {
    wrap: 'border-error/30 bg-error/10 text-error',
    bar: 'bg-error',
  },
};

function toneFor(remaining: number, pct: number | null): Tone {
  if (remaining <= 0) return 'error';
  if (pct !== null && pct > 50) return 'warning';
  return 'normal';
}

/**
 * Badge de consumo da cota de criativos do plano.
 * Mostra "usados de total" com barra de progresso; cor muda conforme o uso
 * (Petróleo ≤50%, Faísca >50%, erro + CTA "Fazer upgrade" ao zerar).
 * Some quando o dado de quota é desconhecido (remaining === null).
 */
export function UsageBadge({ remaining, limit, className = '' }: UsageBadgeProps) {
  if (remaining === null) return null;

  const used = limit !== null ? Math.max(0, limit - remaining) : null;
  const pctRaw = used !== null && limit ? (used / limit) * 100 : null;
  const pct = pctRaw === null ? null : Math.min(100, Math.max(0, pctRaw));
  const tone = toneFor(remaining, pct);
  const classes = TONE_CLASSES[tone];
  const exhausted = remaining <= 0;

  return (
    <div
      data-testid="usage-badge"
      data-tone={tone}
      className={`inline-flex w-full max-w-56 flex-col gap-1.5 rounded-xl border px-3 py-2 ${classes.wrap} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold">
        {exhausted ? (
          <span>Limite de criativos do mês atingido</span>
        ) : used !== null ? (
          <span>
            {used} de {limit} criativo{used !== 1 ? 's' : ''} usados este mês
          </span>
        ) : (
          <span>
            {remaining} criativo{remaining !== 1 ? 's' : ''} restantes este mês
          </span>
        )}
      </div>

      {pct !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            data-testid="usage-bar"
            data-pct={pct}
            className={`h-full rounded-full ${classes.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {exhausted && (
        <Link
          to="/planos"
          data-testid="usage-upgrade-cta"
          className="mt-0.5 inline-flex items-center justify-center rounded-lg border border-current/30 px-2.5 py-1 text-xs font-semibold hover:bg-white/5"
        >
          Fazer upgrade
        </Link>
      )}
    </div>
  );
}
