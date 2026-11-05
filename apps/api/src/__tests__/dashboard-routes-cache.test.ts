import { describe, it, expect } from 'vitest';
import dashboardRoutes from '../routes/dashboard.routes.js';

describe('dashboard.routes', () => {
  it('instagram-insights passa pelo cache HTTP (cacheHandler na cadeia)', () => {
    const layer = (dashboardRoutes as any).stack.find(
      (l: any) => l.route?.path === '/instagram-insights'
    );
    expect(layer).toBeDefined();

    const handlers = layer.route.stack.map((s: any) => s.handle);
    const cacheHandler = handlers.find((f: any) => f.name === 'cacheHandler');
    expect(cacheHandler).toBeDefined();
    // cache vem DEPOIS do auth/tenant (montados no index.ts) — só valida que
    // é o último antes do controller
    expect(handlers.indexOf(cacheHandler)).toBe(handlers.length - 2);
  });
});
