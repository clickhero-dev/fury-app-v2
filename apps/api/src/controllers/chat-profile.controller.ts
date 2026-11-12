import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ChatProfileService } from '../services/core/chat-profile.service.js';

export class ChatProfileController {
  constructor(private readonly service: ChatProfileService) {}
  snapshot = async (req: Request,res: Response,next: NextFunction) => {
    try { res.json({ success:true, data:await this.service.snapshot(req.tenant!.tenantId,req.user!.userId) }); }
    catch (err) { next(err); }
  };
  update = async (req: Request,res: Response,next: NextFunction) => {
    try {
      const body = z.object({ userVersion:z.string().regex(/^\d{1,10}$/), tenantVersion:z.string().regex(/^\d{1,10}$/),
        name:z.string().min(1).max(255).optional(),tenantName:z.string().min(1).max(255).optional(),businessContext:z.string().optional(),
      }).strict().refine(value => value.name !== undefined || value.tenantName !== undefined || value.businessContext !== undefined).parse(req.body);
      const {userVersion,tenantVersion,...values}=body;
      res.json({success:true,data:await this.service.update(req.tenant!.tenantId,req.user!.userId,userVersion,tenantVersion,values)});
    } catch (err) { next(err); }
  };
}
