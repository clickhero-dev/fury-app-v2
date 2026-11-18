import { ChatTurnRecoveryRuntime } from '../services/chat/chat-turn-recovery-runtime.js';
import { ChatTurnRecoveryRepository } from '../repository/chat-turn-recovery.repository.js';
import { ChatPlanRepository } from '../repository/chat-plan.repository.js';
import { ChatPlanAccess } from '../services/chat/chat-plan-runtime.js';

let timer: ReturnType<typeof setInterval> | undefined;
let runtime: ChatTurnRecoveryRuntime | undefined;
let pending: Promise<void> | undefined;

/** Called at API startup. PostgreSQL, not this interval, is the queue and fence. */
export function startChatTurnRecoveryWorker(): void {
  if (timer || !process.env.CHAT_DELEGATION_SECRET) return;
  const access = new ChatPlanAccess((t,u) => new ChatPlanRepository(t,u));
  runtime = new ChatTurnRecoveryRuntime(new ChatTurnRecoveryRepository(),{
    authorize: item => access.authorizeRecovery(item),
  },{baseUrl:process.env.CHAT_SERVICE_URL ?? 'http://localhost:8000',secret:process.env.CHAT_DELEGATION_SECRET});
  const tick = () => {
    if (pending) return;
    pending = runtime!.tick().catch(() => {
      console.error('[chat-turn] recuperação pendente; nova verificação automática');
    }).finally(() => {pending=undefined;});
  };
  timer = setInterval(tick,5000);
  timer.unref();
  tick();
}

export async function stopChatTurnRecoveryWorker(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = undefined;
  runtime?.stop();
  await pending;
  runtime = undefined;
}
