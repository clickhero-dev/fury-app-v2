import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { BusinessContextService } from '../services/core/business-context.service.js';

const improveSchema = z.object({ text: z.string().min(1).max(5000) });

export class BusinessContextController {
  constructor(private readonly service: BusinessContextService) {}

  improve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text } = improveSchema.parse(req.body);
      const abort = new AbortController();
      req.on('close', () => abort.abort());
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      let terminal = false;
      for await (const chunk of this.service.stream(text, abort.signal)) {
        if (typeof chunk === 'string') {
          res.write(`event: fragment\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
        } else if (chunk.done) {
          terminal = true;
          res.write('event: done\ndata: {}\n\n');
        }
      }
      if (!terminal && !res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ code: 'BUSINESS_CONTEXT_STREAM_INCOMPLETE', message: 'A sugestão não foi concluída. Tente novamente.' })}\n\n`);
      }
      if (!res.writableEnded) res.end();
    } catch (error) {
      if (!res.headersSent) next(error);
      else if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ code: 'BUSINESS_CONTEXT_PROVIDER_ERROR', message: 'Não foi possível melhorar o texto agora.' })}\n\n`);
        res.end();
      }
    }
  };
}
