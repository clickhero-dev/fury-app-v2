import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

export const posthogEnabled = Boolean(KEY);

export function hasTrialAccessTokenInLocation(pathname: string, hash: string): boolean {
  return pathname === '/trial/acesso' && new URLSearchParams(hash.replace(/^#/, '')).has('token');
}

type PostHogEvent = { properties?: Record<string, unknown> };

export function sanitizeTrialAccessEvent<T extends PostHogEvent>(event: T): T {
  if (!event.properties) return event;
  let changed = false;
  const properties = { ...event.properties };
  for (const key of ['$current_url', '$url']) {
    const value = properties[key];
    if (typeof value !== 'string') continue;
    try {
      const url = new URL(value);
      if (url.pathname === '/trial/acesso' && url.hash) {
        url.hash = '';
        properties[key] = url.toString();
        changed = true;
      }
    } catch {
      // Preserve non-URL values; only sanitize valid Trial access URLs.
    }
  }
  return changed ? { ...event, properties } as T : event;
}

export function initPosthog() {
  if (!posthogEnabled || typeof window === 'undefined') return;
  posthog.init(KEY, {
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: hasTrialAccessTokenInLocation(window.location.pathname, window.location.hash),
    before_send: (event) => sanitizeTrialAccessEvent(event),
    session_recording: {
      recordCrossOriginIframes: false,
      maskInputOptions: { password: true, number: true },
      maskTextSelector: '[data-ph-no-capture], input[type="password"], input[type="number"]',
    },
    person_profiles: 'identified_only',
  });
}

export function identifyUser(identity: {
  email: string | null;
  name?: string | null;
  tenantId?: string | null;
  plan?: string | null;
}) {
  if (!posthogEnabled) return;
  if (!identity.email) return;
  posthog.identify(identity.email, {
    email: identity.email,
    name: identity.name ?? undefined,
    tenant_id: identity.tenantId ?? undefined,
    plan: identity.plan ?? undefined,
  });
}

export function resetUser() {
  if (!posthogEnabled) return;
  posthog.reset();
}

export function startReplay() {
  if (!posthogEnabled) return;
  if (typeof window !== 'undefined' && hasTrialAccessTokenInLocation(window.location.pathname, window.location.hash)) return;
  posthog.startSessionRecording();
}

export function stopReplay() {
  if (!posthogEnabled) return;
  posthog.stopSessionRecording();
}

export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (!posthogEnabled) return;
  posthog.capture(event, properties);
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!posthogEnabled) return;
  posthog.captureException(error, context);
}

export function registerGlobalErrorHandlers() {
  if (!posthogEnabled || typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    captureException(event.error ?? new Error(event.message), {
      source: 'window.onerror',
      url: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    captureException(event.reason, { source: 'unhandledrejection' });
  });
}
