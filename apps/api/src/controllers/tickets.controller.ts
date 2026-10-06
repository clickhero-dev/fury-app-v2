import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { TicketService } from '../services/tickets/ticket.service.js';

const createTicketSchema = z.object({
  email: z.string().trim().email(),
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5_000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  level: z.enum(['N1', 'N2', 'N3', 'N4']),
  assigneeId: z.number().int().positive().optional(),
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
