import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@/hooks/useBilling';
import { CircleAlert, CircleCheck, Zap } from 'lucide-react';

interface UsageBadgeProps {
  /** Criativos restantes no ciclo atual; null = desconhecido (não renderiza). */
  remaining: number | null;
  /** Total do plano no ciclo; null = total desconhecido (sem barra/%). */
  limit: number | null;
  /** Classes extras para o container (layout do pai decide largura/alinhamento). */
  className?: string;
}

type Tone = 'normal' | 'warning' | 'error';

const TONE_CLASSES: Record<Tone, { bar: string; iconColor: string }> = {
  normal: { bar: 'bg-brand', iconColor: '#1E88A8' },
  warning: { bar: 'bg-[#CF6F03]', iconColor: '#E39A31' },
  error: { bar: 'bg-error', iconColor: 'currentColor' },
};

function toneFor(remaining: number, pct: number | null): Tone {
  if (remaining <= 0) return 'error';
  if (pct !== null && pct > 50) return 'warning';
  return 'normal';
}

/** "Renova em 12 dias" (ou "hoje") a partir do fim do ciclo atual. */
function renewLabel(periodEnd: string | null | undefined): string | null {
  if (!periodEnd) return null;
  const days = Math.ceil((new Date(periodEnd).getTime() - Date.now()) / 86_400_000);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return 'renova hoje';
  return `renova em ${days} dia${days !== 1 ? 's' : ''}`;
}

/**
 * Card compacto de uso mensal da cota de criativos (estilo "Monthly Usage"):
 * título "Uso mensal" + % à direita, barra de progresso e linha de renovação.
 * Cor muda conforme o uso (Petróleo ≤50%, Faísca >50%, erro + CTA ao zerar).
 * Some quando o dado de quota é desconhecido (remaining === null).
 */
export function UsageBadge({ remaining, limit, className = '' }: UsageBadgeProps) {
  const queryClient = useQueryClient();
  const { data: subscription } = useSubscription();
  const renew = renewLabel(subscription?.currentPeriodEnd);

  // Enquanto não há dado de quota, consulta a assinatura em background;
  // se ela também não existir, o badge simplesmente não renderiza.
  if (remaining === null) {
    void queryClient;
    return null;
  }

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
      className={`inline-flex w-full max-w-64 flex-col gap-2 rounded-xl border border-white/10 bg-[#161814] px-4 py-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#ECEDEF]">
          <Icon
            data-testid="usage-icon"
            aria-hidden="true"
            className="size-4 shrink-0"
            color={classes.iconColor}
          />
          <span data-testid="usage-label" className="whitespace-nowrap">
            Uso mensal
          </span>
        </div>
        <span data-testid="usage-pct" className="whitespace-nowrap text-xs text-[#9BA3AB]">
          {exhausted ? (
            '0 criativos'
          ) : used !== null ? (
            <>
              {remaining} de {limit}
            </>
          ) : (
            `${remaining} restantes`
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
          className="h-2 w-full overflow-hidden rounded-full bg-white/10"
        >
          <div
            data-testid="usage-bar"
            data-pct={pct}
            className={`h-full rounded-full ${classes.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-[#9BA3AB]">
        <span data-testid="usage-renew" className="whitespace-nowrap">
          {exhausted ? 'Limite do mês atingido' : renew ?? 'reinicia todo mês'}
        </span>
        {exhausted && (
          <Link
            to="/planos"
            data-testid="usage-upgrade-cta"
            className="inline-flex items-center rounded-lg border border-error/40 px-2 py-1 text-xs font-semibold text-error hover:bg-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8] focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
          >
            Fazer upgrade
          </Link>
        )}
      </div>
    </div>
  );
}
