import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { TicketService } from '../services/tickets/ticket.service.js';
import { TICKET_AREA_LABELS, TICKET_LABELS, TICKET_SCOPE_LABELS } from '../lib/clickup-tickets.client.js';

const createTicketSchema = z.object({
  email: z.string().trim().email(),
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5_000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  level: z.enum(['N1', 'N2', 'N3', 'N4']),
  assigneeId: z.number().int().positive().optional(),
  labels: z.array(z.enum(TICKET_LABELS)).min(1).max(4).refine((labels) => new Set(labels).size === labels.length, 'As etiquetas não podem se repetir'),
}).superRefine(({ labels }, context) => {
  const scopeCount = labels.filter((label) => (TICKET_SCOPE_LABELS as readonly string[]).includes(label)).length;
  const areaCount = labels.filter((label) => (TICKET_AREA_LABELS as readonly string[]).includes(label)).length;
  if (scopeCount < 1 || scopeCount > 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ['labels'], message: 'Selecione uma ou duas etiquetas de escopo.' });
  if (areaCount !== 0 && areaCount !== 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ['labels'], message: 'Selecione zero ou duas etiquetas de área.' });
});

/** Controller fino; valida o input e delega a abertura ao serviço. */
export class TicketsController {
  constructor(private readonly ticketService: Pick<TicketService, 'createTicket' | 'listTickets' | 'listAssignees'>) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createTicketSchema.parse(req.body);
      const ticket = await this.ticketService.createTicket(input);
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
