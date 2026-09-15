import { Link } from 'react-router-dom';
import { CircleCheck, CircleAlert, Zap } from 'lucide-react';

interface UsageBadgeProps {
  /** Criativos restantes no ciclo atual; null = desconhecido (não renderiza). */
  remaining: number | null;
  /** Total do plano no ciclo; null = total desconhecido (sem barra/%). */
  limit: number | null;
  /** Classes extras para o container (layout do pai decide largura/alinhamento). */
  className?: string;
}

type Tone = 'normal' | 'warning' | 'error';

const TONE_CLASSES: Record<Tone, { wrap: string; bar: string; iconColor: string }> = {
  normal: {
    wrap: 'border-[#1E88A8]/25 bg-[#1E88A8]/10 text-[#E7EEF3]',
    bar: 'bg-[#1E88A8]',
    iconColor: '#1E88A8',
  },
  warning: {
    wrap: 'border-[#CF6F03]/30 bg-[#CF6F03]/10 text-[#E7EEF3]',
    bar: 'bg-[#CF6F03]',
    iconColor: '#E39A31',
  },
  error: {
    wrap: 'border-error/30 bg-error/10 text-[#E7EEF3]',
    bar: 'bg-error',
    iconColor: 'currentColor',
  },
};

function toneFor(remaining: number, pct: number | null): Tone {
  if (remaining <= 0) return 'error';
  if (pct !== null && pct > 50) return 'warning';
  return 'normal';
}

/**
 * Badge de consumo da cota de criativos do plano.
 * Mostra "usados/total" com barra de progresso; cor muda conforme o uso
 * (Petróleo ≤50%, Faísca >50%, erro + CTA "Fazer upgrade" ao zerar).
 * Some quando o dado de quota é desconhecido (remaining === null).
 * A11y: role="status" atômico; cor nunca é o único indicador (ícone+texto);
 * barra exposta como progressbar; rótulo nowrap (sem quebra no pill).
 */
export function UsageBadge({ remaining, limit, className = '' }: UsageBadgeProps) {
  if (remaining === null) return null;

  const used = limit !== null ? Math.max(0, limit - remaining) : null;
  const pctRaw = used !== null && limit ? (used / limit) * 100 : null;
  const pct = pctRaw === null ? null : Math.min(100, Math.max(0, pctRaw));
  const tone = toneFor(remaining, pct);
  const classes = TONE_CLASSES[tone];
  const exhausted = remaining <= 0;

  const Icon = exhausted ? CircleAlert : pct !== null && pct > 50 ? Zap : CircleCheck;

  return (
    <div
      data-testid="usage-badge"
      data-tone={tone}
      role="status"
      aria-atomic="true"
      className={`inline-flex w-full max-w-56 flex-col gap-1.5 rounded-xl border px-3 py-2 ${classes.wrap} ${className}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon
          data-testid="usage-icon"
          aria-hidden="true"
          className="size-3.5 shrink-0"
          color={classes.iconColor}
        />
        <span
          data-testid="usage-label"
          className="min-w-0 whitespace-nowrap"
          title={exhausted ? 'Limite de criativos do mês atingido' : undefined}
        >
          {exhausted ? (
            'Limite do mês atingido'
          ) : used !== null ? (
            <>
              {used}/{limit} usados{limit !== null ? ' este mês' : ''}
            </>
          ) : (
            `${remaining} restantes este mês`
          )}
        </span>
      </div>

      {pct !== null && (
        <div
          data-testid="usage-bar-wrap"
          role="progressbar"
          aria-valuemin={0}
          aria-valuenow={pct}
          aria-valuemax={100}
          aria-label="Cota de criativos usada"
          className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        >
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
          className="mt-0.5 inline-flex items-center justify-center rounded-lg border border-current/30 px-2.5 py-1 text-xs font-semibold hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8] focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
        >
          Fazer upgrade
        </Link>
      )}
    </div>
  );
}
