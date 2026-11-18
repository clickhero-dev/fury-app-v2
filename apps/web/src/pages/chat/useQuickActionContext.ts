import { useEffect, useState, useSyncExternalStore } from 'react';
import api from '../../lib/api';
import { normalizeQuickActionContext, type QuickActionContext } from './quick-actions';

function identityScope(): string {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return JSON.stringify([typeof user.tenantId === 'string' ? user.tenantId : null,
      typeof user.id === 'string' ? user.id : typeof user.userId === 'string' ? user.userId : null]);
  } catch { return '[null,null]'; }
}
function subscribe(listener: () => void) {
  window.addEventListener('storage',listener);
  return () => window.removeEventListener('storage',listener);
}
/** Optional authenticated context; never block the composer or reuse another tenant's data. */
export function useQuickActionContext(enabled: boolean): QuickActionContext {
  const scope = useSyncExternalStore(subscribe,identityScope,()=> '[null,null]');
  const [snapshot, setSnapshot] = useState<{scope:string;context:QuickActionContext} | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void api.get('/auth/me').then(response => {
      if (active && identityScope() === scope) setSnapshot({scope,context:normalizeQuickActionContext(response.data?.data)});
    }).catch(() => { if (active && identityScope() === scope) setSnapshot({scope,context:{}}); });
    return () => { active = false; };
  }, [enabled,scope]);
  return enabled && snapshot?.scope === scope ? snapshot.context : {};
}
