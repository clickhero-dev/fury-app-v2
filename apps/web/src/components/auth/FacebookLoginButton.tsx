import { Loader2 } from 'lucide-react';
import { useState } from 'react';

interface FacebookLoginButtonProps {
  label?: string;
}

// Base da API (mesma do axios). O login social é navegação top-level direta —
// NÃO XHR — senão o browser descarta o cookie de nonce anti-CSRF do backend.
const API_BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/+$/, '');

// Logo oficial do Facebook (não recolorir / distorcer — brand guidelines da Meta).
const FACEBOOK_ICON = (
  <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#1877F2"
      d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z"
    />
  </svg>
);

export function FacebookLoginButton({ label = 'Entrar com Facebook' }: FacebookLoginButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    window.location.href = `${API_BASE}/auth/facebook/url?origin=${encodeURIComponent(window.location.origin)}`;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="ady-btn flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#181915] py-3 text-sm font-medium text-slate-700 dark:text-zinc-300 shadow-sm transition-all duration-200 hover:border-[#1E88A8]/50 hover:bg-white dark:hover:bg-[#1a1b17] [&:hover:not(:disabled)]:shadow-md [&:active:not(:disabled)]:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? (
        <Loader2 className="size-5 animate-spin text-[#1E88A8]" />
      ) : (
        <>
          {FACEBOOK_ICON}
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
