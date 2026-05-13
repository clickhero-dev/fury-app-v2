import type { Response } from 'express';

const clients = new Map<string, Set<Response>>();

export function registerSSEClient(tenantId: string, res: Response) {
  if (!clients.has(tenantId)) {
    clients.set(tenantId, new Set());
  }

  clients.get(tenantId)?.add(res);

  res.on('close', () => {
    clients.get(tenantId)?.delete(res);
  });
}

export function emitToTenant(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const tenantClients = clients.get(tenantId);

  if (!tenantClients) return;

  for (const client of tenantClients) {
    client.write(`event: ${event}\n`);
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}