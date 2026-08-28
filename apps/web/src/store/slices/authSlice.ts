import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit';
import { isPlanExpiredFromDate } from '../../components/layout/subscriptionGuard';

/** Chaves de persistência do plano no localStorage (sobrevivem a reload e a falhas de API). */
const PLAN_KEY = 'fury-plan';
const PLAN_EXPIRATION_KEY = 'fury-plan-expiration';

export interface AuthState {
  token: string | null;
  refreshToken: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  tenantId: string | null;
  metaId: string | null;
  plan: string | null;
  planExpiration: string | null;
  theme: 'light' | 'dark';
}

function getInitialTheme(): 'light' | 'dark' {
  // Fonte única: fury-theme. Fallbacks legados ('theme' do antigo Context, 'ady-theme').
  const stored =
    localStorage.getItem('fury-theme') ??
    localStorage.getItem('theme') ??
    localStorage.getItem('ady-theme');

  if (stored === 'dark' || stored === 'escuro') return 'dark';
  if (stored === 'light' || stored === 'claro') return 'light';

  // Sem escolha salva (primeiro acesso ou 'system'): segue a preferência do SO
  let prefersDark = false;
  try {
    prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    // matchMedia indisponível: mantém claro
  }
  return prefersDark ? 'dark' : 'light';
}

function hydrate(): AuthState {
  try {
    const user = JSON.parse(localStorage.getItem('user') ?? '{}');
    return {
      token: localStorage.getItem('token'),
      refreshToken: localStorage.getItem('refreshToken'),
      name: user.name ?? null,
      email: user.email ?? null,
      role: user.role ?? null,
      tenantId: user.tenantId ?? null,
      metaId: null,
      plan: localStorage.getItem(PLAN_KEY),
      planExpiration: localStorage.getItem(PLAN_EXPIRATION_KEY),
      theme: getInitialTheme(),
    };
  } catch {
    return {
      token: null,
      refreshToken: null,
      name: null,
      email: null,
      role: null,
      tenantId: null,
      metaId: null,
      plan: localStorage.getItem(PLAN_KEY),
      planExpiration: localStorage.getItem(PLAN_EXPIRATION_KEY),
      theme: getInitialTheme(),
    };
  }
}

const initialState: AuthState = hydrate();

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login(
      state,
      action: PayloadAction<{
        token: string;
        refreshToken: string;
        name: string | null;
        email: string;
        role: string | null;
        tenantId: string;
      }>
    ) {
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken;
      state.name = action.payload.name;
      state.email = action.payload.email;
      state.role = action.payload.role;
      state.tenantId = action.payload.tenantId;
    },
    setTokens(state, action: PayloadAction<{ token: string; refreshToken: string }>) {
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken;
    },
    setUserProfile(state, action: PayloadAction<{ name: string | null }>) {
      if (action.payload.name !== undefined) {
        state.name = action.payload.name;
      }
    },
    setMetaId(state, action: PayloadAction<string | null>) {
      state.metaId = action.payload;
    },
    setPlan(state, action: PayloadAction<{ plan: string | null; planExpiration: string | null }>) {
      state.plan = action.payload.plan;
      state.planExpiration = action.payload.planExpiration;
      // Persiste para sobreviver a reload e servir de fonte confiável contra falhas de API.
      if (action.payload.plan === null) {
        localStorage.removeItem(PLAN_KEY);
      } else {
        localStorage.setItem(PLAN_KEY, action.payload.plan);
      }
      if (action.payload.planExpiration === null) {
        localStorage.removeItem(PLAN_EXPIRATION_KEY);
      } else {
        localStorage.setItem(PLAN_EXPIRATION_KEY, action.payload.planExpiration);
      }
    },
    setTheme(state, action: PayloadAction<'light' | 'dark'>) {
      state.theme = action.payload;
    },
    logout(state) {
      state.token = null;
      state.refreshToken = null;
      state.name = null;
      state.email = null;
      state.role = null;
      state.tenantId = null;
      state.metaId = null;
      state.plan = null;
      state.planExpiration = null;
      localStorage.removeItem(PLAN_KEY);
      localStorage.removeItem(PLAN_EXPIRATION_KEY);
    },
  },
});

export const {
  login,
  setTokens,
  setUserProfile,
  setMetaId,
  setPlan,
  setTheme,
  logout,
} = authSlice.actions;

// Selectors de Primitivos
export const selectToken = (state: { auth: AuthState }) => state.auth.token;
export const selectRefreshToken = (state: { auth: AuthState }) => state.auth.refreshToken;
export const selectIsAuthenticated = (state: { auth: AuthState }) => !!state.auth.token;
export const selectName = (state: { auth: AuthState }) => state.auth.name;
export const selectEmail = (state: { auth: AuthState }) => state.auth.email;
export const selectUserRole = (state: { auth: AuthState }) => state.auth.role;
export const selectTenantId = (state: { auth: AuthState }) => state.auth.tenantId;
export const selectMetaId = (state: { auth: AuthState }) => state.auth.metaId;
export const selectPlan = (state: { auth: AuthState }) => state.auth.plan;
export const selectPlanExpiration = (state: { auth: AuthState }) => state.auth.planExpiration;
export const selectTheme = (state: { auth: AuthState }) => state.auth.theme;

/**
 * Estado de vencimento a partir da data persistida no Redux/localStorage.
 * `true` = vencida · `false` = válida · `null` = desconhecido (sem data confiável).
 * Memoizado e não sujeito a falhas transitórias da API (usa o último valor conhecido).
 */
export const selectIsPlanExpired = createSelector(
  [selectPlanExpiration],
  (planExpiration) => isPlanExpiredFromDate(planExpiration)
);

// Selector Memoizado (evita re-renders e elimina a warning no console)
export const selectUser = createSelector(
  [selectName, selectEmail, selectTenantId],
  (name, email, tenantId) => {
    if (!email) return null;
    return { name, email, tenantId };
  }
);

export default authSlice.reducer;