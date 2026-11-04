import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { TicketService } from '../services/tickets/ticket.service.js';
import { TICKET_LABELS } from '../lib/clickup-tickets.client.js';

const createTicketSchema = z.object({
  email: z.string().trim().email(),
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5_000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  level: z.enum(['N1', 'N2', 'N3', 'N4', 'N5']),
  assigneeId: z.preprocess((value) => value === '' || value === undefined ? undefined : Number(value), z.number().int().positive().optional()),
  labels: z.preprocess((value) => {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  }, z.array(z.enum(TICKET_LABELS)).max(4).refine((labels) => new Set(labels).size === labels.length, 'As etiquetas não podem se repetir').optional().default([])),
});

/** Controller fino; valida o input e delega a abertura ao serviço. */
export class TicketsController {
  constructor(private readonly ticketService: Pick<TicketService, 'createTicket' | 'listTickets' | 'listAssignees'>) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createTicketSchema.parse(req.body);
      const files = Array.isArray(req.files) ? req.files : [];
      const attachments = files.map((file) => ({ buffer: file.buffer, filename: file.originalname, mimeType: file.mimetype }));
      const ticket = await this.ticketService.createTicket({ ...input, ...(attachments.length > 0 ? { attachments } : {}) });
      res.status(201).json({ success: true, data: ticket, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };

  list = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.ticketService.listTickets();
      res.json({ success: true, ...result, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };

  listAssignees = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const assignees = await this.ticketService.listAssignees();
      res.json({ success: true, data: assignees, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };
}
