import { z } from 'zod';
import { chatRequest } from './chat-request';
import type { RecoveryState } from './RecoveryStatus';

const recoverySchema = z.object({ status: z.enum(['running', 'queued', 'completed', 'stopped', 'cancelled', 'exhausted']) });
export function recoveryState(value: unknown): RecoveryState | null {
  const parsed = recoverySchema.safeParse(value);
  if (!parsed.success) return null;
  switch (parsed.data.status) {
    case 'queued': return 'recovering';
    case 'stopped':
    case 'exhausted': return 'failed';
    default: return parsed.data.status;
  }
}
export function isRecoveryPending(value: unknown): boolean {
  return ['running', 'recovering'].includes(recoveryState(value) ?? '');
}
export async function cancelChatRun(conversationId: string, runId: string): Promise<'cancelled' | 'completed'> {
  const result = await (await chatRequest(`/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST', body: '{}',
  })).json();
  return z.object({status:z.enum(['cancelled','completed'])}).parse(result).status;
}
