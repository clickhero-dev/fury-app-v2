import { Response } from 'express';

type SSEClients = Map<string, Set<Response>>;

const sseClients: SSEClients = new Map();

export function registerSSEClient(tenantId: string, res: Response): void {
  if (!sseClients.has(tenantId)) {
    sseClients.set(tenantId, new Set());
  }
  sseClients.get(tenantId)!.add(res);
}

export function removeSSEClient(tenantId: string, res: Response): void {
  const clients = sseClients.get(tenantId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) {
      sseClients.delete(tenantId);
    }
  }
}

export function emitToTenant(tenantId: string, event: string, data: unknown): void {
  const clients = sseClients.get(tenantId);
  if (!clients) return;

  const message = `data: ${JSON.stringify({
    event,
    data,
    timestamp: new Date().toISOString(),
  })}\n\n`;

  clients.forEach((res) => {
    if (!res.writableEnded) {
      res.write(message);
    }
  });
}
