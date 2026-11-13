import { useLocation, useNavigate } from 'react-router-dom';
import { ImagePlus, Megaphone, Send } from 'lucide-react';
import { captureEvent } from '@/lib/posthog';
import { useBlockedViews } from '@/hooks/useBlockedViews';

/**
 * Ações flutuantes de criação (canto inferior direito):
 * Criar campanha → wizard · Criar imagem → Criação rápida do Estúdio
 * (deep-link ?criar=rapida) · Postar → fluxo de postagem do Calendário
 * (deep-link ?criar=post — abre o diálogo direto).
 *
 * Ícone-only por decisão de UX — cada botão exige nome acessível (aria-label)
 * além do tooltip nativo (title).
 */
const EXCLUDED_PREFIXES = [
  '/chat', // o composer do assistente precisa permanecer livre de sobreposições
  '/criar-campanha', // dentro do wizard não há razão para o atalho
  '/onboarding',
  '/politica',
  '/assinatura-vencida',
  '/admin',
  '/components-demo',
];

const actions = [
  { key: 'criar-campanha', label: 'Criar campanha', icon: Megaphone, to: '/criar-campanha', view: 'campaigns.create' },
  { key: 'criar-imagem', label: 'Criar imagem', icon: ImagePlus, to: '/estudio?criar=rapida', view: 'studio.image' },
  { key: 'postar', label: 'Postar', icon: Send, to: '/calendario?criar=post', view: 'calendar' },
] as const;

export function FabActions() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isBlocked } = useBlockedViews();
  // atalho de tela bloqueada pelo plano some
  const visible = actions.filter((a) => !isBlocked(a.view));

  if (!visible.length || EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      {visible.map(({ key, label, icon: Icon, to }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => {
            captureEvent('fab_click', { action: key });
            navigate(to);
          }}
          className="flex size-12 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Icon className="size-5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}