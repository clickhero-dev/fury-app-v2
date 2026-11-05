import { Response } from 'express';

type SSEClients = Map<string, Set<Response>>;

const sseClients: SSEClients = new Map();
const userSseClients = new Map<string, Set<Response>>();

export function registerSSEClient(tenantId: string, res: Response): void {
  if (!sseClients.has(tenantId)) {
    sseClients.set(tenantId, new Set());
  }

  sseClients.get(tenantId)!.add(res);

  res.on('close', () => {
    removeSSEClient(tenantId, res);
  });
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

export function registerSSEUserClient(tenantId: string, userId: string, res: Response): boolean {
  const key = `${tenantId}:${userId}`;
  const clients = userSseClients.get(key) ?? new Set<Response>();
  if (clients.size >= 5) return false;
  clients.add(res); userSseClients.set(key, clients);
  res.on('close', () => { clients.delete(res); if (!clients.size) userSseClients.delete(key); });
  return true;
}

export function emitToUser(tenantId: string, userId: string, event: string, data: unknown): void {
  const clients = userSseClients.get(`${tenantId}:${userId}`); if (!clients) return;
  const message = `data: ${JSON.stringify({ event, data, timestamp: new Date().toISOString() })}\n\n`;
  clients.forEach((res) => { if (!res.writableEnded) res.write(message); });
}
