import { AsyncLocalStorage } from 'node:async_hooks';
export const requestContext = new AsyncLocalStorage<{ requestId: string; path: string }>();
export function analyticsEnvironment(): string {
  return process.env.APP_ENV || process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || 'unknown';
}
