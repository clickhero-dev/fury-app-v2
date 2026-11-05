import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";
import { RbacRepository } from "../repository/rbac.repository.js";
import { PartnerRepository } from "../repository/partner.repository.js";
import { RBAC_ALL_KEY } from "../lib/rbac-services.js";
import { RBAC_VIEWS } from "../lib/rbac-views.js";
import { rbacService } from "../services/core/rbac.service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// cliente de parceiro; o padrão vale também para o cliente direto da ady
const PARTNER_ROLES = ["user_partner"];
const DEFAULT_ROLES = ["user", "user_partner"];

// telas do cliente (o admin fica de fora)
const EDITABLE_VIEWS = RBAC_VIEWS.filter((v) => !v.key.startsWith("admin."));

const setPermissionSchema = z.object({
  viewKey: z.string().max(100),
  blocked: z.boolean(),
});

// bloqueada pela própria key, por um pai ou por 'all'
function covered(key: string, blocked: string[]) {
  return blocked.includes(RBAC_ALL_KEY) || blocked.some((b) => key === b || key.startsWith(b + "."));
}

/** Permissões (bloqueios de tela + serviço) por parceiro e padrão — rotas só do super_admin. */
export class PermissionsController {
  constructor(
    private rbacRepo: RbacRepository,
    private partners: PartnerRepository,
  ) {}

  // parceiro do :id; null = padrão (todos)
  private async scope(req: Request) {
    if (req.params.id === undefined) return { partnerId: null, roles: DEFAULT_ROLES };
    const partner = UUID_RE.test(req.params.id) ? await this.partners.findById(req.params.id) : null;
    if (!partner) throw new AppError(404, "PARTNER_NOT_FOUND", "Parceiro não encontrado");
    return { partnerId: partner.id, roles: PARTNER_ROLES };
  }

  private async permissions(partnerId: string | null, roles: string[]) {
    const own = await this.rbacRepo.listOwnBlockedViewKeys(roles[0]!, partnerId);
    const defaults = partnerId ? await this.rbacRepo.listOwnBlockedViewKeys(roles[0]!, null) : [];
    return EDITABLE_VIEWS.map((v) => {
      const blocked = own.includes(v.key);
      // travada: vem do padrão ou de uma tela pai
      const locked = covered(v.key, defaults) || (!blocked && covered(v.key, own));
      return { key: v.key, description: v.description, blocked, locked };
    });
  }

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { partnerId, roles } = await this.scope(req);
      res.json({ success: true, data: await this.permissions(partnerId, roles), timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  set = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = setPermissionSchema.parse(req.body);
      const { partnerId, roles } = await this.scope(req);
      const view = EDITABLE_VIEWS.find((v) => v.key === body.viewKey);
      if (!view) throw new AppError(400, "INVALID_VIEW", "Tela inválida");

      const changed = await this.rbacRepo.setViewBlocked({
        roleKeys: roles,
        partnerId,
        viewKey: view.key,
        serviceKeys: view.services ?? [],
        blocked: body.blocked,
        actorUserId: req.user!.userId,
      });
      // vale na hora para os usuários afetados
      if (changed) await rbacService.bumpVersion();
      res.json({ success: true, data: await this.permissions(partnerId, roles), timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };
}
