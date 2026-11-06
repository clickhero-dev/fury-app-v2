import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WizardMessagingDestination } from '../types';

interface MessagingDestinationCardProps {
  destination: Extract<WizardMessagingDestination, 'instagram_direct' | 'messenger'>;
  name: 'Instagram' | 'Facebook';
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function InstagramLogo() {
  return (
    <svg data-testid="instagram-logo" aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none">
      <defs>
        <linearGradient id="instagram-gradient" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFDC80" />
          <stop offset="0.48" stopColor="#F77737" />
          <stop offset="0.74" stopColor="#C13584" />
          <stop offset="1" stopColor="#5851DB" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="url(#instagram-gradient)" strokeWidth="2.3" />
      <circle cx="12" cy="12" r="4" stroke="url(#instagram-gradient)" strokeWidth="2.3" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="#C13584" />
    </svg>
  );
}

function FacebookLogo() {
  return (
    <svg data-testid="facebook-logo" aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8">
      <circle cx="12" cy="12" r="10" fill="#1877F2" />
      <path fill="#fff" d="M13.4 19v-6h2l.3-2.4h-2.3V9.1c0-.7.2-1.2 1.2-1.2h1.3V5.8c-.2 0-1-.1-1.8-.1-1.8 0-3 1.1-3 3.1v1.7H9v2.4h2v6h2.4Z" />
    </svg>
  );
}

export function MessagingDestinationCard({
  destination,
  name,
  description,
  checked,
  onCheckedChange,
}: MessagingDestinationCardProps) {
  return (
    <label
      data-testid={`message-destination-${destination}`}
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn(
        'relative flex min-h-28 cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2',
        checked
          ? 'border-brand bg-brand/10'
          : 'border-border bg-surface hover:border-brand/50',
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span className="flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
        {name === 'Instagram' ? <InstagramLogo /> : <FacebookLogo />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-text-primary">{name}</span>
        <span className="mt-1 block text-xs text-text-secondary">{description}</span>
        {checked && <span className="mt-2 block text-xs font-semibold text-text-primary">Selecionado</span>}
      </span>
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
          checked ? 'border-brand bg-brand text-white' : 'border-border bg-surface',
        )}
        aria-hidden="true"
      >
        {checked && <Check className="h-4 w-4" />}
      </span>
    </label>
  );
}
