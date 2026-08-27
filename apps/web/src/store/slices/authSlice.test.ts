import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * A slice roda `hydrate()` no top-level (initialState), que lê `localStorage`/`window`.
 * Instalamos mocks antes de cada import e usamos `vi.resetModules()` para que o próximo
 * import dinâmico re-avalie a slice com o seed de localStorage atual (sem query string —
 * que quebra o parser oxc do Vite).
 */
function installDomGlobals(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) } as never);
}

async function importSlice() {
  vi.resetModules();
  const mod = (await import('./authSlice')) as typeof import('./authSlice') & {
    default: typeof import('./authSlice').default;
  };
  return { ...mod, reducer: mod.default };
}

const PLAN_KEY = 'fury-plan';
const PLAN_EXPIRATION_KEY = 'fury-plan-expiration';

beforeEach(() => {
  installDomGlobals();
});

describe('authSlice — persistência do plano', () => {
  it('setPlan grava plan e planExpiration no localStorage', async () => {
    const { setPlan, reducer } = await importSlice();
    const exp = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    const next = reducer(undefined, setPlan({ plan: 'Pro', planExpiration: exp }));

    expect(next.plan).toBe('Pro');
    expect(next.planExpiration).toBe(exp);
    expect(localStorage.getItem(PLAN_KEY)).toBe('Pro');
    expect(localStorage.getItem(PLAN_EXPIRATION_KEY)).toBe(exp);
  });

  it('setPlan com null remove as chaves persistidas', async () => {
    installDomGlobals({
      [PLAN_KEY]: 'Pro',
      [PLAN_EXPIRATION_KEY]: 'somedate',
    });
    const { setPlan, reducer } = await importSlice();

    const next = reducer(undefined, setPlan({ plan: null, planExpiration: null }));

    expect(next.plan).toBeNull();
    expect(next.planExpiration).toBeNull();
    expect(localStorage.getItem(PLAN_KEY)).toBeNull();
    expect(localStorage.getItem(PLAN_EXPIRATION_KEY)).toBeNull();
  });

  it('hydrate recupera plan e planExpiration persistidos (sobrevive a reload)', async () => {
    const exp = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    installDomGlobals({ [PLAN_KEY]: 'Pro', [PLAN_EXPIRATION_KEY]: exp });

    const { reducer, selectPlanExpiration } = await importSlice();
    const state = reducer(undefined, { type: '@@init' });

    expect(state.plan).toBe('Pro');
    expect(selectPlanExpiration({ auth: state })).toBe(exp);
  });

  it('logout limpa plan e planExpiration do estado e do localStorage', async () => {
    installDomGlobals({ [PLAN_KEY]: 'Pro', [PLAN_EXPIRATION_KEY]: 'somedate' });
    const { logout, reducer } = await importSlice();

    const state = reducer(undefined, { type: '@@init' });
    const after = reducer(state, logout());

    expect(after.plan).toBeNull();
    expect(after.planExpiration).toBeNull();
    expect(localStorage.getItem(PLAN_KEY)).toBeNull();
    expect(localStorage.getItem(PLAN_EXPIRATION_KEY)).toBeNull();
  });
});

describe('authSlice — selectIsPlanExpired', () => {
  it('retorna false para data futura válida', async () => {
    const { reducer, selectIsPlanExpired } = await importSlice();
    const exp = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const state = reducer(undefined, { type: '@@init' });
    const withPlan = { ...state, plan: 'Pro', planExpiration: exp };

    expect(selectIsPlanExpired({ auth: withPlan })).toBe(false);
  });

  it('retorna true para data passada', async () => {
    const { reducer, selectIsPlanExpired } = await importSlice();
    const exp = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const state = reducer(undefined, { type: '@@init' });
    const withPlan = { ...state, plan: 'Pro', planExpiration: exp };

    expect(selectIsPlanExpired({ auth: withPlan })).toBe(true);
  });

  it('retorna null quando não há data (desconhecido)', async () => {
    const { reducer, selectIsPlanExpired } = await importSlice();
    const state = reducer(undefined, { type: '@@init' });

    expect(selectIsPlanExpired({ auth: state })).toBeNull();
  });
});