import { useState } from 'react';
import { needsConsent, setConsent, PRIVACY_URL, type ConsentLevel } from '../lib/cookieConsent';

// classe compartilhada: os 3 botões têm o mesmo peso visual (só a cor muda)
const BTN_BASE = 'rounded-full px-4 py-2 text-xs font-semibold cursor-pointer';
const BTN_OUTLINE = `${BTN_BASE} border border-slate-300 text-slate-700 dark:border-[#3a3a3a] dark:text-[#e5e5e5]`;
const BTN_PRIMARY = `${BTN_BASE} bg-[#17708A] text-white`;

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(() => needsConsent());

  if (!visible) return null;

  const decide = (level: ConsentLevel) => {
    setConsent(level);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Consentimento de cookies"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white p-4 shadow-lg dark:border-[#262824] dark:bg-[#17171a]"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-600 dark:text-[#9BA1A6]">
          Usamos cookies e dados no navegador para manter você conectado e a plataforma
          funcionando. Você pode aceitar todos, manter só os essenciais ou recusar. Veja a{' '}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[#17708A]"
          >
            Política de Privacidade
          </a>
          .
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => decide('rejected')} className={BTN_OUTLINE}>
            Recusar
          </button>
          <button type="button" onClick={() => decide('essential')} className={BTN_OUTLINE}>
            Somente essenciais
          </button>
          <button type="button" onClick={() => decide('all')} className={BTN_PRIMARY}>
            Aceitar todos
          </button>
        </div>
      </div>
    </div>
  );
}
