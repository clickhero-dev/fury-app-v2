import type { PlanResult, StoredPlan, StoredTask } from './chat-plan.domain.js';

/** Complete JSON envelope bounded in UTF8 bytes, not a silently sliced JSON string. */
export function planTextContext(plan: StoredPlan, task: StoredTask): string {
    const previous = plan.tasks.filter(t => task.dependsOn.includes(t.key) && t.status === 'completed');
    let envelope: { previousResults: { key: string; title: string; result?: PlanResult }[]; omittedTaskKeys: string[]; truncated: boolean } = {
        previousResults: [], omittedTaskKeys: previous.map(t => t.key), truncated: previous.length > 0,
    };
    for (const source of previous) {
        const candidate = {
            previousResults: [...envelope.previousResults, { key: source.key, title: source.title, result: source.result }],
            omittedTaskKeys: envelope.omittedTaskKeys.filter(key => key !== source.key),
            truncated: envelope.omittedTaskKeys.length > 1,
        };
        if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') <= 16000)
            envelope = candidate;
    }
    return JSON.stringify(envelope);
}
