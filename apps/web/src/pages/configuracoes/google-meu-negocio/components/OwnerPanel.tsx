import { useState } from 'react';
import {
  Activity,
  BadgeCheck,
  ConciergeBell,
  EllipsisVertical,
  ExternalLink,
  FilePlus,
  Image,
  ListChecks,
  MessageSquareText,
  Pencil,
  ShoppingBag,
  SquarePen,
  Store,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { LoadingSpinner } from '@/components';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { GoogleOwnerAction, GoogleOwnerOverview } from '@/types/google';
import { useGoogleOverview } from '../useGoogleMeuNegocio';
import { StrengthRing } from './StrengthRing';
import { SuggestionCarousel } from './SuggestionCarousel';
import './google-card.css';

const ACTION_ICONS: Record<string, LucideIcon> = {
  edit_profile: Pencil,
  reviews: MessageSquareText,
  photos: Image,
  posts: FilePlus,
  performance: Activity,
  ads: TrendingUp,
  hotel_details: ConciergeBell,
  menu: UtensilsCrossed,
  products: ShoppingBag,
  services: ListChecks,
  request_reviews: SquarePen,
  profiles: Store,
};

const STATUS_HINT: Partial<Record<GoogleOwnerAction['status'], string>> = {
  coming_soon: 'Em breve',
  requires_verification: 'Verifique o perfil para usar',
};

interface OwnerPanelProps {
  profileId: string;
  onAction: (key: string) => void;
}

function ActionTile({ action, onAction }: { action: GoogleOwnerAction; onAction: (key: string) => void }) {
  const Icon = ACTION_ICONS[action.key] ?? Store;
  const hint = STATUS_HINT[action.status];
  const content = (
    <>
      <Icon className="gmb-blue h-7 w-7" strokeWidth={1.75} aria-hidden />
      <span className="w-full truncate text-center text-sm">{action.label}</span>
      {hint && <span className="gmb-pill px-2 py-0.5 text-[11px] leading-4">{hint}</span>}
    </>
  );
  const tileClass = 'gmb-action flex min-h-[104px] w-full flex-col items-center justify-start gap-2 px-2 pt-4 pb-3';

  if (action.status === 'external' && action.externalUrl) {
    return (
      <a
        href={action.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={tileClass}
        title={`${action.label} — gerenciar no Google`}
      >
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={tileClass}
      disabled={action.status !== 'available'}
      title={hint ? `${action.label} — ${hint}` : action.label}
      onClick={() => onAction(action.key)}
    >
      {content}
    </button>
  );
}

function PanelHeader({ overview, onAction }: { overview: GoogleOwnerOverview; onAction: (key: string) => void }) {
  const [showStrength, setShowStrength] = useState(false);
  const { profile, strength, interactions } = overview;
  const initial = profile.name.trim().charAt(0).toUpperCase() || 'G';
  const missing = strength.items.filter((item) => !item.done);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative shrink-0">
            {profile.logoUrl ? (
              <img src={profile.logoUrl} alt={profile.name} className="gmb-avatar h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="gmb-avatar flex h-16 w-16 items-center justify-center rounded-full text-2xl" aria-hidden>
                {initial}
              </div>
            )}
            {profile.verified && (
              <span className="gmb-badge absolute -right-0.5 -bottom-0.5 rounded-full" title="Perfil verificado">
                <BadgeCheck className="h-6 w-6" aria-label="Perfil verificado" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="gmb-title">Sua empresa no Google</h2>
            {interactions ? (
              <p className="gmb-blue text-sm">{interactions.total.toLocaleString('pt-BR')} interações com clientes</p>
            ) : (
              <p className="gmb-text-2 truncate text-sm">
                {profile.name}
                {profile.categoryName ? ` · ${profile.categoryName}` : ''}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-3 text-right"
            aria-expanded={showStrength}
            onClick={() => setShowStrength((open) => !open)}
          >
            <span>
              <span className="block text-sm">Força do perfil</span>
              <span className="gmb-link block text-sm">
                {strength.complete ? 'Informações completas' : 'Informações incompletas'}
              </span>
            </span>
            <StrengthRing percent={strength.percent} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="gmb-icon-button p-2" aria-label="Mais opções">
                <EllipsisVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-text-primary" onSelect={() => onAction('connection')}>
                Conexão e dados
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="text-text-primary">
                <a href="https://business.google.com/" target="_blank" rel="noopener noreferrer">
                  Abrir no Google <ExternalLink className="ml-auto h-4 w-4" />
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showStrength && (
        <div className="gmb-strength-list space-y-2 p-4 text-sm">
          <p>
            Força do perfil: <strong>{strength.percent}%</strong>{' '}
            <span className="gmb-text-2">(estimativa do Ady)</span>
          </p>
          {missing.length === 0 ? (
            <p className="gmb-text-2">Tudo preenchido.</p>
          ) : (
            <ul className="gmb-text-2 list-disc space-y-1 pl-5">
              {missing.map((item) => (
                <li key={item.key}>{item.label}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Painel do dono, réplica de "Sua empresa no Google". */
export function OwnerPanel({ profileId, onAction }: OwnerPanelProps) {
  const { data: overview, isLoading, isError, refetch } = useGoogleOverview(profileId);

  return (
    <div className="ady-decor gmb-scope">
      <section className="gmb-panel space-y-6" aria-label="Sua empresa no Google">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : isError || !overview ? (
          <div className="space-y-3 py-10 text-center">
            <p className="text-sm">Não foi possível carregar o painel do Google.</p>
            <button type="button" className="gmb-blue text-sm font-medium hover:underline" onClick={() => void refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <PanelHeader overview={overview} onAction={onAction} />

            {!overview.profile.verified && (
              <p className="gmb-pill inline-block px-3 py-1 text-xs">
                Perfil ainda não verificado: algumas ações ficam liberadas após a verificação.
              </p>
            )}

            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-6" role="list" aria-label="Ações do perfil">
              {overview.actions.map((action) => (
                <div role="listitem" key={action.key}>
                  <ActionTile action={action} onAction={onAction} />
                </div>
              ))}
            </div>

            <SuggestionCarousel profileId={profileId} suggestions={overview.suggestions} onAction={onAction} />

            <div className="gmb-text-2 flex flex-wrap justify-between gap-2 text-xs">
              <span>Só os administradores do perfil podem ver isso</span>
              <span>Prévia gerada pelo Ady</span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
