import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NodeSDK } from '@opentelemetry/sdk-node';

const sdkStart = vi.fn();
const sdkShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn().mockImplementation(function () {
    return { start: sdkStart, shutdown: sdkShutdown };
  }),
}));

vi.mock('@opentelemetry/host-metrics', () => ({
  HostMetrics: vi.fn().mockImplementation(function () {
    return { start: vi.fn() };
  }),
}));

// Import só depois dos mocks (hoisted) para capturar as classes mockadas
const { initOtel, shutdownOtel } = await import('../lib/otel.js');

const OLD_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...OLD_ENV };
  delete process.env.OTEL_ENABLED;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_SERVICE_NAME;
});

afterEach(async () => {
  await shutdownOtel();
  process.env = { ...OLD_ENV };
});

const NodeSDKMock = vi.mocked(NodeSDK);

describe('initOtel', () => {
  it('retorna disabled quando OTEL_ENABLED não está setado', () => {
    expect(initOtel()).toEqual({ enabled: false });
    expect(NodeSDKMock).not.toHaveBeenCalled();
  });

  it('retorna disabled quando OTEL_ENABLED=true mas sem endpoint', () => {
    process.env.OTEL_ENABLED = 'true';
    expect(initOtel()).toEqual({ enabled: false });
    expect(NodeSDKMock).not.toHaveBeenCalled();
  });

  it('inicia o SDK quando habilitado com endpoint', () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
    const result = initOtel();
    expect(result).toEqual({ enabled: true });
    expect(NodeSDKMock).toHaveBeenCalledTimes(1);
    expect(NodeSDKMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.anything(),
        traceExporter: expect.anything(),
        metricReader: expect.anything(),
        logRecordProcessor: expect.anything(),
        instrumentations: expect.any(Array),
      })
    );
    expect(sdkStart).toHaveBeenCalledTimes(1);
  });

  it('usa OTEL_SERVICE_NAME como service.name do resource', () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
    process.env.OTEL_SERVICE_NAME = 'fury-api';
    initOtel();
    const opts = NodeSDKMock.mock.calls[0]?.[0];
    expect(opts?.resource).toBeDefined();
  });
});

describe('shutdownOtel', () => {
  it('fecha o SDK quando inicializado', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
    initOtel();
    await shutdownOtel();
    expect(sdkShutdown).toHaveBeenCalledTimes(1);
  });

  it('resolve sem erro quando nunca inicializado', async () => {
    await expect(shutdownOtel()).resolves.toBeUndefined();
    expect(sdkShutdown).not.toHaveBeenCalled();
  });
});