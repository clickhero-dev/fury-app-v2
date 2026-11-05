import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getApiState, setCheck, setStatus, isHealthy, isDegraded, isCritical, getMissingEnvs, handleCriticalFailure } from '../../lib/api-state.js';

describe('api-startup workflow — api-state', () => {
  const originalEnv = { ...process.env };
  let originalExit: typeof process.exit;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Set required envs
    process.env.DATABASE_URL = 'postgresql://test';
    process.env.REDIS_URL = 'redis://test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh';
    process.env.TOKEN_ENCRYPTION_KEY = 'test-key';
    originalExit = process.exit;
    process.exit = vi.fn() as any;
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('api-state', () => {
    it('inicializa com status starting', () => {
      const state = getApiState();
      expect(state.status).toBe('starting');
      expect(state.checks).toEqual({});
    });

    it('setCheck registra resultado', () => {
      setCheck('db', true, 'latency 5ms');
      const state = getApiState();
      expect(state.checks.db).toEqual(expect.objectContaining({ ok: true, detail: 'latency 5ms' }));
    });

    it('setStatus altera status e healthyAt', () => {
      setStatus('healthy');
      const state = getApiState();
      expect(state.status).toBe('healthy');
      expect(state.healthyAt).toBeDefined();
    });

    it('isHealthy retorna true quando healthy', () => {
      setStatus('healthy');
      expect(isHealthy()).toBe(true);
      expect(isDegraded()).toBe(false);
      expect(isCritical()).toBe(false);
    });

    it('isDegraded retorna true quando degraded', () => {
      setStatus('degraded');
      expect(isDegraded()).toBe(true);
    });

    it('isCritical retorna true quando critical', () => {
      setStatus('critical');
      expect(isCritical()).toBe(true);
    });

    it('getMissingEnvs retorna vars ausentes', () => {
      delete process.env.DATABASE_URL;
      delete process.env.REDIS_URL;
      const missing = getMissingEnvs();
      expect(missing).toContain('DATABASE_URL');
      expect(missing).toContain('REDIS_URL');
    });

    it('getMissingEnvs retorna array vazio quando todas presentes', () => {
      const missing = getMissingEnvs();
      expect(missing).toEqual([]);
    });

    it('handleCriticalFailure seta status critical e agenda exit', () => {
      handleCriticalFailure('test reason');
      const state = getApiState();
      expect(state.status).toBe('critical');
      // process.exit é chamado após 10s via setTimeout
      vi.advanceTimersByTime(10_000);
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});