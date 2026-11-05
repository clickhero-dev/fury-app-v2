import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  processor: null as null | ((job: { name: string }) => Promise<unknown>),
  queueClose: vi.fn(async () => undefined),
  workerClose: vi.fn(async () => undefined),
  deleteExpiredBatch: vi.fn(),
  schedule: vi.fn(async () => undefined),
}));

vi.mock('bullmq', () => ({
  Queue: class { close = state.queueClose; },
  Worker: class {
    close = state.workerClose;
    constructor(_name: string, processor: (job: { name: string }) => Promise<unknown>) { state.processor = processor; }
  },
}));
vi.mock('../lib/queue.js', () => ({ getRedisConnection: vi.fn(async () => ({})) }));
vi.mock('../lib/job-scheduler.js', () => ({ replaceLegacyRepeatablesWithScheduler: state.schedule }));
vi.mock('../repository/notification.repository.js', () => ({
  NotificationRepository: class { deleteExpiredBatch = state.deleteExpiredBatch; },
}));

import {
  NOTIFICATION_RETENTION_JOB_NAME,
  NOTIFICATION_RETENTION_QUEUE_NAME,
  startNotificationRetentionWorker,
  stopNotificationRetentionWorker,
} from '../workers/notification-retention.worker.js';

describe('notification retention worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.processor = null;
  });
  afterEach(async () => stopNotificationRetentionWorker());

  it('registers an immediate daily scheduler and deletes all expired batches', async () => {
    state.deleteExpiredBatch.mockResolvedValueOnce(500).mockResolvedValueOnce(10).mockResolvedValueOnce(0);
    await startNotificationRetentionWorker();

    expect(state.schedule).toHaveBeenCalledWith(
      expect.anything(), [], [], `${NOTIFICATION_RETENTION_JOB_NAME}-every-day`,
      { every: 24 * 60 * 60 * 1000, immediately: true },
      expect.objectContaining({ name: NOTIFICATION_RETENTION_JOB_NAME }),
    );
    expect(state.processor).not.toBeNull();
    await expect(state.processor!({ name: NOTIFICATION_RETENTION_JOB_NAME })).resolves.toEqual({ deleted: 510 });
    expect(state.deleteExpiredBatch).toHaveBeenCalledTimes(3);
  });

  it('rejects jobs with an unexpected name', async () => {
    await startNotificationRetentionWorker();

    await expect(state.processor!({ name: 'unexpected' })).rejects.toThrow('Unsupported notification retention job: unexpected');
  });

  it('closes its worker and queue when stopped', async () => {
    await startNotificationRetentionWorker();
    await stopNotificationRetentionWorker();

    expect(state.workerClose).toHaveBeenCalledOnce();
    expect(state.queueClose).toHaveBeenCalledOnce();
  });
});
