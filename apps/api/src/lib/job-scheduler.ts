export interface JobSchedulerQueue {
  getRepeatableJobs(): Promise<Array<{ name: string; key: string }>>;
  removeRepeatableByKey(key: string): Promise<boolean>;
  getJobSchedulers(): Promise<Array<{ key: string; id?: string | null }>>;
  removeJobScheduler(id: string): Promise<boolean>;
  upsertJobScheduler(...args: any[]): Promise<unknown>;
}

/** Removes explicitly named legacy schedules before registering the descriptive stable scheduler. */
export async function replaceLegacyRepeatablesWithScheduler(
  queue: JobSchedulerQueue,
  legacyJobNames: readonly string[],
  legacySchedulerIds: readonly string[],
  schedulerId: string,
  repeatOptions: Record<string, unknown>,
  jobTemplate: { name: string; data: unknown; opts?: Record<string, unknown> },
): Promise<unknown> {
  const legacyNameSet = new Set(legacyJobNames);
  const repeatables = await queue.getRepeatableJobs();
  for (const repeatable of repeatables) {
    if (legacyNameSet.has(repeatable.name)) {
      await queue.removeRepeatableByKey(repeatable.key);
    }
  }

  const legacyIdSet = new Set(legacySchedulerIds);
  const schedulers = await queue.getJobSchedulers();
  for (const scheduler of schedulers) {
    if (legacyIdSet.has(scheduler.key)) {
      await queue.removeJobScheduler(scheduler.key);
    }
  }

  return queue.upsertJobScheduler(schedulerId, repeatOptions, jobTemplate);
}
