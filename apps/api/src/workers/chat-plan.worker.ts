import { getRedisConnection } from '../lib/queue.js';
import { ChatPlanRecoveryRepository } from '../repository/chat-plan.repository.js';
import { Queue, Worker, type ConnectionOptions, MetricsTime } from 'bullmq';
import { z } from 'zod';
import type { ChatPlanExecutor } from '../services/chat/chat-plan-executor.js';
import type { PlanQueue, PlanWake } from '../services/chat/chat-plan.service.js';
export const CHAT_PLAN_QUEUE_NAME = 'chat-plan-execution';
export const CHAT_PLAN_EXECUTE_JOB = 'worker-chat-plan-execute-step';
export const CHAT_PLAN_RECONCILE_JOB = 'worker-chat-plan-reconcile-step';
export const CHAT_PLAN_RECOVERY_JOB = 'cron-chat-plan-recover-executions';
export const CHAT_PLAN_RECOVERY_SCHEDULER = 'cron-chat-plan-recover-executions-every-minute';
const wakeSchema = z.object({ tenantId: z.string().uuid(), userId: z.string().uuid(), conversationId: z.string().uuid(), planId: z.string().uuid(), version: z.number().int().positive() }).strict();
const recoverySchema = z.object({ afterId: z.string().uuid().optional() }).strict();
type QueueData = PlanWake | {
    afterId?: string;
};
type Recovery = Pick<ChatPlanRecoveryRepository, 'listRecoverable'>;
export class ChatPlanQueue implements PlanQueue {
    readonly queue: Queue<QueueData>;
    constructor(connection: ConnectionOptions, private readonly options: {
        prefix?: string;
    } = {}) {
        this.queue = new Queue<QueueData>(CHAT_PLAN_QUEUE_NAME, { connection, ...options, defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 1000 } });
    }
    async enqueue(wake: PlanWake, delayMs = 0): Promise<void> {
        const data = wakeSchema.parse(wake);
        await this.queue.add(CHAT_PLAN_EXECUTE_JOB, data, { jobId: `plan-${data.planId}-v${data.version}`, delay: Math.max(0, Math.min(delayMs, 120000)) });
    }
    async scheduleRecovery(): Promise<void> {
        await this.queue.upsertJobScheduler(CHAT_PLAN_RECOVERY_SCHEDULER, { every: 60000 }, { name: CHAT_PLAN_RECOVERY_JOB, data: {}, opts: { attempts: 2, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 1000 } });
    }
    async recover(repository: Recovery, afterId?: string): Promise<void> {
        const rows = await repository.listRecoverable(afterId);
        const bucket = Math.floor(Date.now() / 60000);
        for (const row of rows) {
            const data = wakeSchema.parse(row);
            // Separate generation from version dedupe: a completed old job must not strand a stale lease.
            await this.queue.add(CHAT_PLAN_RECONCILE_JOB, data, { jobId: `recover-${row.planId}-v${row.version}-${bucket}` });
        }
        if (rows.length === 100)
            await this.queue.add(CHAT_PLAN_RECOVERY_JOB, { afterId: rows[rows.length - 1].planId }, { jobId: `recover-page-${rows[rows.length - 1].planId}-${bucket}` });
    }
    async close() {
        await this.queue.close();
    }
}
let sharedQueue: Promise<ChatPlanQueue> | undefined;
/** Lazy DI/registry hook. Instantiate only after Redis is ready. */
export function getChatPlanQueue(): Promise<ChatPlanQueue> {
    if (!sharedQueue)
        sharedQueue = getRedisConnection().then(connection => new ChatPlanQueue(connection)).catch(error => {
            sharedQueue = undefined;
            throw error;
        });
    return sharedQueue;
}
export async function closeChatPlanQueue(): Promise<void> {
    const current = sharedQueue;
    sharedQueue = undefined;
    if (current)
        await (await current).close();
}
export function createChatPlanWorker(connection: ConnectionOptions, executor: Pick<ChatPlanExecutor, 'run'>, queue: ChatPlanQueue, recovery: Recovery, options: {
    prefix?: string;
} = {}): Worker<QueueData> {
    const worker = new Worker<QueueData>(CHAT_PLAN_QUEUE_NAME, async (job) => {
        if (job.name === CHAT_PLAN_RECOVERY_JOB) {
            const input = recoverySchema.parse(job.data);
            await queue.recover(recovery, input.afterId);
            return { recovered: true };
        }
        if (![CHAT_PLAN_EXECUTE_JOB, CHAT_PLAN_RECONCILE_JOB].includes(job.name))
            throw new Error('CHAT_PLAN_JOB_NOT_ALLOWED');
        await executor.run(wakeSchema.parse(job.data));
        return { checked: true };
    }, { connection, ...options, name: 'worker-chat-plan-executor', concurrency: 4, lockDuration: 180000, maxStalledCount: 1, metrics: { maxDataPoints: MetricsTime.ONE_WEEK } });
    // Never log payloads, provider errors, user prompts or credentials.
    worker.on('error', () => console.error('[chat-plan] fila indisponível'));
    worker.on('failed', () => console.error('[chat-plan] etapa aguardando recuperação ou revisão'));
    return worker;
}

/** Wait for Redis, register durable recovery, and reconcile persisted work before returning. */
export async function startChatPlanWorkerRuntime(connection: ConnectionOptions, executor: Pick<ChatPlanExecutor, 'run'>, queue: ChatPlanQueue, recovery: Recovery, options: {
    prefix?: string;
} = {}): Promise<Worker<QueueData>> {
    const worker = createChatPlanWorker(connection, executor, queue, recovery, options);
    try {
        await Promise.all([worker.waitUntilReady(), queue.queue.waitUntilReady()]);
        await queue.scheduleRecovery();
        try {
            await queue.recover(recovery);
        }
        catch {
            // The recurring scheduler retries reconciliation without exposing DB details.
            console.error('[chat-plan] recuperação inicial pendente; o scheduler tentará novamente');
        }
        return worker;
    }
    catch (error) {
        await worker.close();
        throw error;
    }
}

let processWorker: Worker<QueueData> | undefined;
let startingWorker: Promise<Worker<QueueData>> | undefined;

/** Process-level worker used by API startup; repeated calls share one worker. */
export function startChatPlanWorker(executor: Pick<ChatPlanExecutor, 'run'>): Promise<Worker<QueueData>> {
    if (processWorker)
        return Promise.resolve(processWorker);
    if (!startingWorker) {
        startingWorker = (async () => {
            try {
                const [connection, queue] = await Promise.all([getRedisConnection(), getChatPlanQueue()]);
                const worker = await startChatPlanWorkerRuntime(connection, executor, queue, new ChatPlanRecoveryRepository());
                processWorker = worker;
                return worker;
            }
            catch (error) {
                await closeChatPlanQueue().catch(() => undefined);
                throw error;
            }
            finally {
                startingWorker = undefined;
            }
        })();
    }
    return startingWorker;
}

export async function stopChatPlanWorker(): Promise<void> {
    if (startingWorker)
        await startingWorker.catch(() => undefined);
    const worker = processWorker;
    processWorker = undefined;
    await worker?.close();
    await closeChatPlanQueue();
}
