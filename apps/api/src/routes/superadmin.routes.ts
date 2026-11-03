import { Router } from "express";
import type { NextFunction, Request, Response } from 'express';
import { controllers } from "../di.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { adminScopeMiddleware, superadminMiddleware } from "../middleware/superadmin.middleware.js";
import multer from 'multer';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

router.use(authMiddleware);

// Liberadas ao parceiro (admin_partner), presas aos clientes dele; o resto do arquivo é só super_admin
export const partnerRouter = Router();
partnerRouter.use(adminScopeMiddleware);
partnerRouter.param("tenantId", controllers.superadmin.tenantParam);

// Dashboard
partnerRouter.get("/dashboard", controllers.superadmin.getDashboard);

// Tenants
partnerRouter.get("/tenants", controllers.superadmin.listTenants);
partnerRouter.get("/tenants/:id", controllers.superadmin.getTenant);
partnerRouter.delete("/tenants/:id", controllers.superadmin.deleteTenant);
partnerRouter.get("/tenants/:tenantId/campaigns", controllers.superadmin.listTenantCampaigns);
partnerRouter.put("/tenants/:tenantId/goals", controllers.superadmin.upsertGoals);
partnerRouter.patch("/tenants/:tenantId/audience", controllers.superadmin.updateAudience);
partnerRouter.get("/tenants/:tenantId/brand-kit", controllers.superadmin.getBrandKit);
partnerRouter.patch("/tenants/:tenantId/brand-kit", controllers.superadmin.upsertBrandKit);
partnerRouter.patch("/tenants/:tenantId/fury-config", controllers.superadmin.updateFuryConfig);

// Users
partnerRouter.get("/users", controllers.superadmin.listUsers);
partnerRouter.post("/users", controllers.superadmin.createUser);
partnerRouter.get("/users/check-email/:email", controllers.superadmin.checkEmail);
partnerRouter.patch("/users/:id", controllers.superadmin.updateUser);
partnerRouter.delete("/users/:id", controllers.superadmin.deleteUser);

// Clientes do parceiro (vagas + Novo Cliente)
partnerRouter.get("/my-partner", controllers.superadmin.mySlots);
partnerRouter.post("/my-partner/clients", controllers.superadmin.createPartnerClient);
// Chave de IA do próprio parceiro (Integrações)
partnerRouter.get("/my-partner/ai-key", controllers.partners.getAiKey);
partnerRouter.put("/my-partner/ai-key", controllers.partners.saveAiKey);
partnerRouter.delete("/my-partner/ai-key", controllers.partners.clearAiKey);

// Planos (cada um vê os seus: parceiro os dele, super os da ady) e assinatura dos clientes
partnerRouter.get("/plans", controllers.superadmin.listPlans);
partnerRouter.post("/plans", controllers.superadmin.createPlan);
partnerRouter.patch("/plans/:id", controllers.superadmin.updatePlan);
partnerRouter.delete("/plans/:id", controllers.superadmin.deletePlan);
partnerRouter.get("/tenants/:tenantId/assignable-plans", controllers.superadmin.assignablePlans);
partnerRouter.patch("/tenants/:tenantId/subscription", controllers.superadmin.updateSubscription);
partnerRouter.post("/tenants/:tenantId/reset-quota", controllers.superadmin.resetQuota);

router.use(partnerRouter);

// Daqui pra baixo: só super_admin (rota nova cai aqui por padrão)
router.use(superadminMiddleware);

const ticketAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new AppError(400, 'INVALID_TICKET_ATTACHMENT', 'Envie imagens PNG, JPG ou WebP, ou vídeos MP4 ou MOV.'));
  },
});

const ticketAttachments = (req: Request, res: Response, next: NextFunction) => {
  ticketAttachmentUpload.array('attachments', 5)(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Cada anexo pode ter no máximo 50 MB.'
        : 'Envie no máximo cinco anexos por ticket.';
      next(new AppError(400, 'INVALID_TICKET_ATTACHMENT', message));
      return;
    }
    next(error);
  });
};

router.post('/tickets', ticketAttachments, controllers.tickets.create);
router.get('/tickets', controllers.tickets.list);
router.get('/tickets/assignees', controllers.tickets.listAssignees);
const faqImageUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mimetype)),
});

router.get('/faqs', controllers.faq.listAdmin);
router.post('/faqs', controllers.faq.create);
router.patch('/faqs/:id', controllers.faq.update);
router.delete('/faqs/:id', controllers.faq.delete);
router.post('/faqs/images', faqImageUpload.single('file'), controllers.faq.uploadImage);

router.get('/announcements', controllers.announcement.listAdmin);
router.post('/announcements', controllers.announcement.create);
router.post('/announcements/format', controllers.announcement.formatText);
router.patch('/announcements/:id', controllers.announcement.update);
router.delete('/announcements/:id', controllers.announcement.delete);

// Healthcheck Meta (global superadmin view)
router.get('/healthchecks/users', controllers.metaHealthchecks.listUsers);
router.get('/healthchecks', controllers.metaHealthchecks.getLatest);
router.post('/healthchecks/run', controllers.metaHealthchecks.run);

// Setup tenant + user
router.post("/setup-tenant", controllers.superadmin.setupTenant);

// Parceiros (empresa + conta do parceiro) e restauração de cliente excluído
router.get("/partners", controllers.partners.list);
router.post("/partners", controllers.partners.create);
router.get("/partners/:id", controllers.partners.get);
router.patch("/partners/:id", controllers.partners.update);
// chave de IA: super só vê se existe; quem cadastra é o próprio parceiro
router.get("/partners/:id/ai-key", controllers.partners.getAiKey);
router.get("/deleted-tenants", controllers.partners.listDeletedTenants);
router.post("/deleted-tenants/:id/restore", controllers.partners.restoreTenant);

// Permissões (telas bloqueadas) por parceiro e padrão (todos)
router.get("/partners/:id/permissions", controllers.permissions.get);
router.put("/partners/:id/permissions", controllers.permissions.set);
router.get("/permissions/default", controllers.permissions.get);
router.put("/permissions/default", controllers.permissions.set);

export default router;
