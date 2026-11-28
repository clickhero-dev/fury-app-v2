import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";
import { PartnerPlanRepository } from "../repository/partner-plan.repository.js";
import { EDITABLE_VIEWS, covered } from "./permissions.controller.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// limite técnico da coluna integer
const MAX_CENTS = 2_147_483_647;

const fields = {
  name: z.string().trim().min(1, "Informe o nome do plano").max(255, "O nome pode ter no máximo 255 caracteres"),
  priceCents: z
    .number()
    .int("Informe o preço em centavos")
    .min(0, "O preço não pode ser negativo")
    .max(MAX_CENTS, "O preço máximo é R$ 21.474.836,47"),
  maxTenants: z.number().int("Informe as vagas em número inteiro").min(0, "As vagas não podem ser negativas").max(10000, "O máximo é 10.000 vagas"),
  isActive: z.boolean(),
  blockedViews: z.array(z.string().max(100)).max(100),
};

const createSchema = z.object({ ...fields, isActive: fields.isActive.optional(), blockedViews: fields.blockedViews.default([]) });
const updateSchema = z
  .object(fields)
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Nada para alterar");

// chaves do catálogo, sem repetição e sem filho já coberto pelo pai
function normalizeViews(keys: string[]): string[] {
  const invalid = keys.find((k) => !EDITABLE_VIEWS.some((v) => v.key === k));
  if (invalid) throw new AppError(400, "INVALID_VIEW", `Tela inválida: ${invalid}`);
  const unique = [...new Set(keys)];
  return unique.filter((k) => !covered(k, unique.filter((o) => o !== k))).sort();
}

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

const NAME_EXISTS = () => new AppError(409, "PLAN_NAME_EXISTS", "Já existe um plano de parceiro com este nome.");

/** Planos de parceiro — rotas só do super_admin. */
export class PartnerPlanController {
  constructor(private repo: PartnerPlanRepository) {}

  private async planOr404(id: string) {
    const plan = UUID_RE.test(id) ? await this.repo.findById(id) : null;
    if (!plan) throw new AppError(404, "PARTNER_PLAN_NOT_FOUND", "O plano escolhido não existe ou foi removido.");
    return plan;
  }

  list = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await this.repo.list());
    } catch (err) {
      next(err);
    }
  };

  // catálogo de telas que o plano pode bloquear
  views = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, EDITABLE_VIEWS.map((v) => ({ key: v.key, description: v.description })));
    } catch (err) {
      next(err);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await this.planOr404(req.params.id));
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createSchema.parse(req.body);
      const id = await this.repo.create({ ...body, blockedViews: normalizeViews(body.blockedViews) }, req.user!.userId);
      if (id === "name_exists") throw NAME_EXISTS();
      ok(res, await this.repo.findById(id), 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await this.planOr404(req.params.id);
      const body = updateSchema.parse(req.body);
      const input = body.blockedViews ? { ...body, blockedViews: normalizeViews(body.blockedViews) } : body;
      if ((await this.repo.update(plan.id, input, req.user!.userId)) === "name_exists") throw NAME_EXISTS();
      ok(res, await this.repo.findById(plan.id));
    } catch (err) {
      next(err);
    }
  };
}
