import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { normalizeQuickActionContext, type QuickActionContext } from './quick-actions';

/** Optional authenticated context; never block the composer or call a provider. */
export function useQuickActionContext(enabled: boolean): QuickActionContext {
  const [context, setContext] = useState<QuickActionContext>({});
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void api.get('/auth/me').then(response => {
      if (active) setContext(normalizeQuickActionContext(response.data?.data));
    }).catch(() => { if (active) setContext({}); });
    return () => { active = false; };
  }, [enabled]);
  return enabled ? context : {};
}
