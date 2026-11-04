import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { AppError } from "../middleware/errorHandler.js";
import { PartnerRepository } from "../repository/partner.repository.js";
import { SuperAdminRepository } from "../repository/superadmin.repository.js";
import { rbacService } from "../services/core/rbac.service.js";
import { openrouterService } from "../services/llms/openrouter.service.js";
import { encryptAccessToken } from "../lib/meta-api.js";
import { clearAiKeyCache } from "../lib/ai-key-context.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createPartnerSchema = z.object({
  name: z.string().trim().min(1).max(255),
  maxTenants: z.number().int().min(0).max(10000),
  accountName: z.string().trim().min(1).max(255),
  accountEmail: z.string().trim().email(),
  accountPassword: z.string().min(8).max(255),
});

const updatePartnerSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  maxTenants: z.number().int().min(0).max(10000).optional(),
});

// formato da chave do provedor; a mensagem nunca repete o valor
const aiKeySchema = z.object({
  key: z.string().trim().regex(/^sk-or-[A-Za-z0-9_-]{20,200}$/, "Formato de chave inválido"),
});

export function slugify(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

/** Parceiros e restauração de clientes excluídos — rotas só do super_admin. */
export class PartnerController {
  constructor(
    private repo: PartnerRepository,
    private adminRepo: SuperAdminRepository,
  ) {}

  private async partnerOr404(id: string) {
    const partner = UUID_RE.test(id) ? await this.repo.findById(id) : null;
    if (!partner) throw new AppError(404, "PARTNER_NOT_FOUND", "Parceiro não encontrado");
    return partner;
  }

  list = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await this.repo.list());
    } catch (err) {
      next(err);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await this.partnerOr404(req.params.id));
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createPartnerSchema.parse(req.body);
      // e-mail preso mesmo de conta excluída
      if (await this.adminRepo.findUserByEmail(body.accountEmail))
        throw new AppError(409, "EMAIL_EXISTS", "Email já cadastrado");

      const base = slugify(body.name) || "parceiro";
      const slug = (await this.repo.findTenantBySlug(base)) ? `${base}-${Date.now().toString(36)}` : base;
      const passwordHash = await bcrypt.hash(body.accountPassword, 10);

      const { partner } = await this.repo.createWithAccount(body.name, body.maxTenants, slug, {
        name: body.accountName,
        email: body.accountEmail,
        passwordHash,
      });
      ok(res, await this.repo.findById(partner.id), 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updatePartnerSchema.parse(req.body);
      const partner = await this.partnerOr404(req.params.id);
      // limite nunca abaixo dos clientes atuais
      if (body.maxTenants !== undefined && body.maxTenants < partner.usedTenants)
        throw new AppError(409, "LIMIT_BELOW_USAGE", `O parceiro já tem ${partner.usedTenants} cliente(s). O limite não pode ser menor.`);

      await this.repo.update(partner.id, body);
      ok(res, await this.repo.findById(partner.id));
    } catch (err) {
      next(err);
    }
  };

  listDeletedTenants = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await this.repo.listDeletedTenants());
    } catch (err) {
      next(err);
    }
  };

  restoreTenant = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = UUID_RE.test(req.params.id) ? await this.repo.findDeletedTenant(req.params.id) : null;
      if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Cliente excluído não encontrado");

      // cliente de parceiro volta ocupando vaga
      if (tenant.partnerId) {
        const partner = await this.repo.findById(tenant.partnerId);
        if (partner && partner.usedTenants >= partner.maxTenants)
          throw new AppError(409, "PARTNER_LIMIT", `O parceiro ${partner.name} já usa todas as ${partner.maxTenants} vagas.`);
      }

      await this.repo.restoreTenant(tenant.id);
      // usuários do cliente voltam a entrar na hora
      await rbacService.bumpVersion();
      ok(res, null);
    } catch (err) {
      next(err);
    }
  };

  // ── Chave de IA: só o próprio parceiro cadastra; super só vê se existe ──
  // id do parceiro: da URL só na leitura do super; gravar usa sempre o escopo
  private async aiKeyPartnerId(req: Request, fromUrl = false) {
    if (fromUrl && req.params.id !== undefined) return (await this.partnerOr404(req.params.id)).id;
    const partnerId = req.adminScope?.partnerId;
    if (!partnerId) throw new AppError(404, "PARTNER_NOT_FOUND", "Parceiro não encontrado");
    return partnerId;
  }

  private async aiKeyStatus(partnerId: string) {
    const status = await this.repo.getAiKeyStatus(partnerId);
    if (!status) throw new AppError(404, "PARTNER_NOT_FOUND", "Parceiro não encontrado");
    return status;
  }

  getAiKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await this.aiKeyStatus(await this.aiKeyPartnerId(req, true)));
    } catch (err) {
      next(err);
    }
  };

  saveAiKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const partnerId = await this.aiKeyPartnerId(req);
      const { key } = aiKeySchema.parse(req.body);
      await this.aiKeyStatus(partnerId);

      // testa antes de gravar: chave errada não é salva
      const check = await openrouterService.verifyKey(key);
      if (check === "invalid") throw new AppError(422, "AI_KEY_INVALID", "Chave de IA inválida.");
      if (check === "unavailable") throw new AppError(503, "AI_KEY_UNVERIFIED", "Não foi possível validar a chave agora. Tente de novo.");

      await this.repo.setAiKey(partnerId, { encrypted: encryptAccessToken(key), last4: key.slice(-4) }, req.user!.userId);
      clearAiKeyCache();
      openrouterService.clearCreditCache();
      ok(res, await this.aiKeyStatus(partnerId));
    } catch (err) {
      next(err);
    }
  };

  clearAiKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const partnerId = await this.aiKeyPartnerId(req);
      await this.aiKeyStatus(partnerId);
      await this.repo.setAiKey(partnerId, null, req.user!.userId);
      clearAiKeyCache();
      openrouterService.clearCreditCache();
      ok(res, await this.aiKeyStatus(partnerId));
    } catch (err) {
      next(err);
    }
  };
}
