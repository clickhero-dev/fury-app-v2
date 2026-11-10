import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { chatRequest } from './chat-request';
import {
  canCompleteManualTask, chatPlanError, chatPlanResponseSchema, chatPlansResponseSchema, isChatPlanActive,
  type ChatPlan, type ChatPlanAction, type ChatPlanEdit, type ChatPlanTask,
} from './chat-plans';

export const CHAT_PLANS_POLL_MS = 5000;
export const CHAT_PLANS_TIMEOUT_MS = 30000;

type PlansSnapshot = {
  plans: ChatPlan[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  errors: Record<string, string>;
  busyPlanIds: string[];
};

/** One store per selected conversation: no late response can cross that boundary. */
class ChatPlansStore {
  private snapshot: PlansSnapshot;
  private listeners = new Set<() => void>();
  private active = false;
  private generation = 0;
  private loadSequence = 0;
  private loadController: AbortController | null = null;
  private mutations = new Map<string, AbortController>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pollDelay = CHAT_PLANS_POLL_MS;
  private readonly path: string;

  constructor(private readonly conversationId: string | null, private readonly enabled: boolean) {
    this.path = `/conversations/${encodeURIComponent(conversationId || '')}/plans`;
    this.snapshot = { plans: [], loading: Boolean(conversationId && enabled), refreshing: false, error: null, errors: {}, busyPlanIds: [] };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.snapshot;
  private publish(change: Partial<PlansSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach(listener => listener());
  }
  start = () => {
    this.active = Boolean(this.conversationId && this.enabled);
    if (this.active) void this.refetch();
    return () => this.stop();
  };
  private stop() {
    this.active = false;
    this.generation++;
    this.loadSequence++;
    clearTimeout(this.timer);
    this.loadController?.abort();
    this.loadController = null;
    this.mutations.forEach(controller => controller.abort());
    this.mutations.clear();
    // StrictMode may restart this same store; do not retain a cancelled request's busy state.
    this.snapshot = { ...this.snapshot, busyPlanIds: [], refreshing: false };
  }
  private schedule() {
    clearTimeout(this.timer);
    if (this.active && !this.loadController && !this.mutations.size && this.snapshot.plans.some(isChatPlanActive)) {
      this.timer = setTimeout(() => { void this.refetch(); }, this.pollDelay);
    }
  }

  private async request(path: string, init: RequestInit, controller: AbortController): Promise<unknown> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => {};
    // Race the entire body read, not just headers. Even an uncooperative transport is fenced.
    const interrupted = new Promise<never>((_, reject) => {
      abort = () => reject(new DOMException('Cancelado', 'AbortError'));
      controller.signal.addEventListener('abort', abort, { once: true });
      timeout = setTimeout(() => {
        reject(new DOMException('Tempo limite', 'TimeoutError'));
        controller.abort();
      }, CHAT_PLANS_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        chatRequest(path, { ...init, signal: controller.signal }).then(response => response.json()),
        interrupted,
      ]);
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', abort);
    }
  }

  refetch = async (): Promise<void> => {
    if (!this.active) return;
    clearTimeout(this.timer);
    const generation = this.generation;
    const sequence = ++this.loadSequence;
    this.loadController?.abort();
    const controller = new AbortController();
    this.loadController = controller;
    const current = () => this.active && generation === this.generation && sequence === this.loadSequence;
    this.publish({ refreshing: true });
    try {
      const data = chatPlansResponseSchema.parse(await this.request(this.path, { method: 'GET' }, controller));
      if (!current()) return;
      if (data.plans.some(plan => plan.conversationId !== this.conversationId)
        || new Set(data.plans.map(plan => plan.id)).size !== data.plans.length) throw new Error('Invalid plan scope');
      // A slow replica/poll must never replace a newer mutation result with an older version.
      const known = new Map(this.snapshot.plans.map(plan => [plan.id, plan]));
      const plans = data.plans.map(plan => {
        const previous = known.get(plan.id);
        return previous && previous.version > plan.version ? previous : plan;
      });
      this.pollDelay = CHAT_PLANS_POLL_MS;
      this.publish({ plans, error: null });
    } catch (error) {
      if (current()) {
        this.pollDelay = (error as { status?: number })?.status === 429 ? CHAT_PLANS_POLL_MS * 3 : CHAT_PLANS_POLL_MS;
        this.publish({ error: chatPlanError(error, 'load') });
      }
    } finally {
      if (current()) {
        this.loadController = null;
        this.publish({ loading: false, refreshing: false });
        this.schedule();
      }
    }
  };

  private reject(planId: string, message: string): Promise<boolean> {
    if (this.active) this.publish({ errors: { ...this.snapshot.errors, [planId]: message } });
    return Promise.resolve(false);
  }

  private async mutate(plan: ChatPlan, suffix: string, method: 'POST' | 'PATCH', body: ChatPlanEdit): Promise<boolean> {
    if (!this.active || plan.conversationId !== this.conversationId || this.mutations.has(plan.id)) return false;
    const generation = this.generation;
    const controller = new AbortController();
    this.mutations.set(plan.id, controller);
    clearTimeout(this.timer);
    // A GET started before this write cannot overwrite its result or report a stale failure.
    this.loadSequence++;
    this.loadController?.abort();
    this.loadController = null;
    const current = () => this.active && generation === this.generation && this.mutations.get(plan.id) === controller;
    const errors = { ...this.snapshot.errors };
    delete errors[plan.id];
    this.publish({ busyPlanIds: [...this.mutations.keys()], errors, refreshing: false });
    try {
      const data = chatPlanResponseSchema.parse(await this.request(`${this.path}/${encodeURIComponent(plan.id)}${suffix}`, {
        method, body: JSON.stringify(body),
      }, controller));
      if (!current()) return false;
      if (data.plan.id !== plan.id || data.plan.conversationId !== this.conversationId || data.plan.version <= body.version) {
        throw new Error('Invalid mutation response');
      }
      this.publish({ plans: this.snapshot.plans.map(previous => previous.id === plan.id && previous.version <= data.plan.version ? data.plan : previous) });
      return true;
    } catch (error) {
      if (current()) {
        this.publish({ errors: { ...this.snapshot.errors, [plan.id]: chatPlanError(error, 'update') } });
        if ((error as { status?: number })?.status === 409) await this.refetch();
      }
      return false;
    } finally {
      if (current()) {
        this.mutations.delete(plan.id);
        this.publish({ busyPlanIds: [...this.mutations.keys()] });
        this.schedule();
      }
    }
  }

  onAction = (plan: ChatPlan, action: ChatPlanAction): Promise<boolean> => {
    if (!['approve', 'pause', 'resume', 'cancel'].includes(action)) return Promise.resolve(false);
    return this.mutate(plan, `/${action}`, 'POST', { version: plan.version });
  };
  onEdit = (plan: ChatPlan, changes: ChatPlanEdit): Promise<boolean> => {
    if (plan.status !== 'draft' || changes.version !== plan.version) {
      return this.reject(plan.id, 'Este plano já mudou. Atualize a conversa antes de editar.');
    }
    return this.mutate(plan, '', 'PATCH', changes);
  };
  onCompleteTask = (plan: ChatPlan, task: ChatPlanTask): Promise<boolean> => {
    const ownTask = plan.tasks.find(item => item.id === task.id);
    if (!ownTask || !canCompleteManualTask(plan, ownTask)) {
      return this.reject(plan.id, 'Somente tarefas manuais liberadas podem ser confirmadas por você.');
    }
    return this.mutate(plan, `/tasks/${encodeURIComponent(task.id)}/complete`, 'POST', { version: plan.version });
  };
}

/** Call refetch after chat's done event and after approving/rejecting a separate proposed action. */
export function useChatPlans(conversationId: string | null, enabled = true) {
  const store = useMemo(() => new ChatPlansStore(conversationId, enabled), [conversationId, enabled]);
  const currentStore = useRef<ChatPlansStore | null>(null);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    currentStore.current = store;
    const stop = store.start();
    return () => {
      stop();
      if (currentStore.current === store) currentStore.current = null;
    };
  }, [store]);
  // A first-message handler may capture this callback before the conversation exists.
  // Keep it stable and read the current selection; mutations remain scoped to their own store.
  const refetch = useCallback(() => currentStore.current?.refetch() ?? Promise.resolve(), []);
  return { ...snapshot, refetch, onAction: store.onAction, onEdit: store.onEdit, onCompleteTask: store.onCompleteTask };
}
