import type { AccessTokenPayload } from '../../lib/jwt.js';
import { createChatDelegation } from '../../lib/chat-delegation.js';

export interface TurnWake {
  tenantId: string; userId: string; conversationId: string; runId: string; userMessageId: string;
}
export interface TurnRecoveryStore {
  /** Reconcile expired leases/completions, then return at most 20 ID-only candidates. */
  list(): Promise<TurnWake[]>;
  stop(item: TurnWake): Promise<void>;
}
export interface TurnAccess { authorize(item: TurnWake): Promise<AccessTokenPayload> }

/** No Redis/outbox dual write: the recurring bounded scan is the durable wakeup. */
export class ChatTurnRecoveryRuntime {
  private active = false;
  private controller?: AbortController;
  constructor(private readonly store: TurnRecoveryStore, private readonly access: TurnAccess,
    private readonly options: {baseUrl: string; secret: string; fetcher?: typeof fetch}) {}

  async tick(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.controller = new AbortController();
    try {
      const rows = await this.store.list();
      // Fixed concurrency and scan size; no unbounded backlog allocation.
      for (let offset = 0; offset < Math.min(rows.length,20); offset += 2) {
        if (this.controller.signal.aborted) break;
        await Promise.all(rows.slice(offset,offset+2).map(item => this.resume(item)));
      }
    } finally {
      this.active = false;
      this.controller = undefined;
    }
  }

  stop(): void { this.controller?.abort(); }

  private async resume(item: TurnWake): Promise<void> {
    try {
      const user = await this.access.authorize(item);
      const token = createChatDelegation(user,this.options.secret);
      const base = new URL(this.options.baseUrl);
      if (!['http:','https:'].includes(base.protocol) || base.username || base.password) return;
      const signal = AbortSignal.any([AbortSignal.timeout(245000),this.controller!.signal]);
      const response = await (this.options.fetcher ?? fetch)(
        new URL(`/conversations/${item.conversationId}/retry?run_id=${item.runId}`,base).toString(),{
          method:'POST',redirect:'error',signal,
          headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'text/event-stream'},
          body:JSON.stringify({automatic:true,responseCapabilities:['multi_message_v1']}),
        });
      if ([401,403].includes(response.status)) await this.store.stop(item);
      // Discard, never log/persist SSE payloads. The Python producer commits its result.
      if (response.ok && response.body) {
        const reader = response.body.getReader();
        let bytes = 0;
        try {
          for (;;) {
            const result = await reader.read();
            if (result.done) break;
            bytes += result.value.byteLength;
            if (bytes > 2_000_000 || signal.aborted) break;
          }
        } finally { await reader.cancel().catch(() => undefined); }
      } else await response.body?.cancel();
    } catch (error) {
      // DB/transport timeouts remain discoverable; revoked identity is terminal.
      if ([401,403,404].includes(Number((error as {statusCode?:number})?.statusCode)))
        await this.store.stop(item);
    }
  }
}
