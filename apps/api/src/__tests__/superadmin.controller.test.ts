import { describe, it, expect, vi, beforeEach } from "vitest";
import { SuperAdminController } from "../controllers/superadmin.controller.js";

function mockRepo() {
  return {
    listTenants: vi.fn(),
    countUsersByTenant: vi.fn(),
    findLatestSubscriptionByTenant: vi.fn(),
    findPlanById: vi.fn(),
    findPlanInScope: vi.fn(),
    getTenantById: vi.fn(),
    listUsersByTenant: vi.fn(),
    findFuryConfig: vi.fn(),
    findBrandKitByTenant: vi.fn(),
    findClientGoalByTenant: vi.fn(),
    findUserByEmail: vi.fn(),
    createUser: vi.fn(),
    findUserById: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    deleteTenant: vi.fn(),
    findTenantBySlug: vi.fn(),
    listPlans: vi.fn(),
    listSubscriberCountsByPlan: vi.fn(),
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    countSubscriptionsByPlan: vi.fn(),
    migratePlanSubscriptions: vi.fn(),
    deletePlan: vi.fn(),
    paginateUsersAdmin: vi.fn(),
    createClientGoal: vi.fn(),
    updateClientGoal: vi.fn(),
    createFuryConfig: vi.fn(),
    updateFuryConfig: vi.fn(),
    createBrandKit: vi.fn(),
    updateBrandKit: vi.fn(),
  };
}

// escopo do super_admin (todos os clientes), gravado pelo adminScopeMiddleware
const SUPER = { adminScope: { partnerId: null } };

function mockRes() {
  const res = {} as any;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("SuperAdminController — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listTenants monta lista com userCount, subscription e plan", async () => {
    const repo = mockRepo();
    repo.listTenants.mockResolvedValue([{ id: "t-1" }]);
    repo.countUsersByTenant.mockResolvedValue(3);
    repo.findLatestSubscriptionByTenant.mockResolvedValue({
      id: "sub-1",
      planId: "plan-1",
    });
    repo.findPlanById.mockResolvedValue({ id: "plan-1", name: "Pro" });

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.listTenants({ ...SUPER, params: {}, query: {} } as any, res, next);

    expect(repo.listTenants).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: "t-1",
            userCount: 3,
            subscription: expect.objectContaining({ plan: { id: "plan-1", name: "Pro" } }),
          }),
        ]),
      }),
    );
  });

  it("listUsers responde com paginação", async () => {
    const repo = mockRepo();
    repo.paginateUsersAdmin.mockResolvedValue({ rows: [{ id: "u-1" }], total: 1 });

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.listUsers({ ...SUPER, query: { page: "1", limit: "10", search: "" } } as any, res, next);

    expect(repo.paginateUsersAdmin).toHaveBeenCalledWith("", 10, 0, null);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ users: [{ id: "u-1" }], total: 1, page: 1, pages: 1, limit: 10 }),
      }),
    );
  });

  it("createUser cria usuário com 201 e remove passwordHash", async () => {
    const repo = mockRepo();
    repo.findUserByEmail.mockResolvedValue(null);
    repo.createUser.mockResolvedValue({
      id: "u-1",
      tenantId: "e19f2a88-1f1a-4c7b-9e0f-000000000001",
      name: "Ana",
      email: "ana@x.com",
      passwordHash: "hash",
      role: "member",
    });

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    repo.getTenantById.mockResolvedValue({ id: "e19f2a88-1f1a-4c7b-9e0f-000000000001", partnerId: null });
    await c.createUser(
      {
        ...SUPER,
        body: {
          tenantId: "e19f2a88-1f1a-4c7b-9e0f-000000000001",
          name: "Ana",
          email: "ana@x.com",
          password: "12345678",
          role: "member",
        },
      } as any,
      res,
      next,
    );

    expect(repo.createUser).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ id: "u-1" }),
      }),
    );
  });

  it("listPlans adiciona subscriberCount por plano", async () => {
    const repo = mockRepo();
    repo.listPlans.mockResolvedValue([{ id: "plan-1", name: "Pro" }]);
    repo.listSubscriberCountsByPlan.mockResolvedValue([{ planId: "plan-1", count: 5 }]);

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.listPlans({ ...SUPER, params: {}, query: {} } as any, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ id: "plan-1", subscriberCount: 5 })]),
      }),
    );
  });
});

describe("SuperAdminController — erros e validação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createUser com corpo inválido propaga ZodError (400)", async () => {
    const repo = mockRepo();
    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.createUser(
      { body: { name: "Ana", email: "nao-e-email", password: "x", tenantId: "nope" } } as any,
      res,
      next,
    );

    expect(repo.createUser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: "ZodError" }));
  });

  it("createUser com email existente propaga AppError 409 EMAIL_EXISTS", async () => {
    const repo = mockRepo();
    repo.findUserByEmail.mockResolvedValue({ id: "u-1" });

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    repo.getTenantById.mockResolvedValue({ id: "e19f2a88-1f1a-4c7b-9e0f-000000000001", partnerId: null });
    await c.createUser(
      {
        ...SUPER,
        body: {
          tenantId: "e19f2a88-1f1a-4c7b-9e0f-000000000001",
          name: "Ana",
          email: "ana@x.com",
          password: "12345678",
        },
      } as any,
      res,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, code: "EMAIL_EXISTS" }),
    );
  });

  it("sem adminScope (rota fora do adminScopeMiddleware) nega com 403", async () => {
    const repo = mockRepo();
    const c = new SuperAdminController(repo as any);
    const next = vi.fn();

    await c.listTenants({ params: {}, query: {} } as any, mockRes(), next);

    expect(repo.listTenants).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("getTenant com tenant inexistente propaga 404 TENANT_NOT_FOUND", async () => {
    const repo = mockRepo();
    repo.getTenantById.mockResolvedValue(null);

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.getTenant({ ...SUPER, params: { id: "t-0" } } as any, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: "TENANT_NOT_FOUND" }),
    );
  });

  it("updatePlan com plano inexistente propaga 404 PLAN_NOT_FOUND", async () => {
    const repo = mockRepo();
    repo.findPlanInScope.mockResolvedValue(undefined);

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.updatePlan({ ...SUPER, params: { id: "00000000-0000-4000-8000-000000000000" }, body: { name: "X" } } as any, res, next);

    expect(repo.updatePlan).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: "PLAN_NOT_FOUND" }),
    );
  });

  it("deletePlan com assinantes e sem migrateTo propaga 409 PLAN_HAS_SUBSCRIBERS", async () => {
    const repo = mockRepo();
    repo.findPlanInScope.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
    repo.countSubscriptionsByPlan.mockResolvedValue(2);

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.deletePlan({ ...SUPER, params: { id: "00000000-0000-4000-8000-000000000001" }, query: {} } as any, res, next);

    expect(repo.deletePlan).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, code: "PLAN_HAS_SUBSCRIBERS" }),
    );
  });

  it("upsertGoals com body inválido propaga ZodError (400) e não toca o repo", async () => {
    const repo = mockRepo();
    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.upsertGoals(
      { params: { tenantId: "t-1" }, body: { objective: "", monthlyBudget: -5, targetCpa: 0 } } as any,
      res,
      next,
    );

    expect(repo.createClientGoal).not.toHaveBeenCalled();
    expect(repo.updateClientGoal).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: "ZodError" }));
  });
});
describe("SuperAdminController — usuários do cliente e aba Público", () => {
  const sensitive = {
    passwordHash: "hash", resetToken: "reset", resetTokenExpiresAt: new Date(), otpCode: "123456",
    otpExpiresAt: new Date(), googleId: "g-1", facebookId: "f-1",
  };
  const member = { id: "u-member", name: "Membro", email: "m@x.com", role: "member", platformRole: "user", createdAt: new Date(), ...sensitive };
  const owner = { ...member, id: "u-owner", name: "Dono", email: "o@x.com", role: "owner" };
  const partnerAdmin = { ...member, id: "u-adm", role: "owner", platformRole: "admin_partner" };

  function tenantRepo(users: unknown[]) {
    const repo = mockRepo() as any;
    repo.getTenantById.mockResolvedValue({ id: "t-1", partnerId: "p-1" });
    repo.listUsersByTenant.mockResolvedValue(users);
    repo.updateUserAudienceDefaults = vi.fn();
    repo.updateTenant = vi.fn();
    return repo;
  }

  it("getTenant não devolve senha, token de reset, OTP nem ids sociais", async () => {
    const repo = tenantRepo([member, owner]);
    const res = mockRes();

    await new SuperAdminController(repo).getTenant({ ...SUPER, params: { id: "t-1" } } as any, res, vi.fn());

    const users = res.json.mock.calls[0][0].data.users;
    expect(users).toHaveLength(2);
    for (const u of users) {
      expect(Object.keys(u).sort()).toEqual(["createdAt", "email", "id", "name", "platformRole", "role"]);
    }
  });

  it("Salvar Público grava no dono, não no primeiro usuário", async () => {
    const repo = tenantRepo([member, owner]);

    await new SuperAdminController(repo).updateAudience(
      { ...SUPER, params: { tenantId: "t-1" }, body: { city: "Recife" } } as any, mockRes(), vi.fn(),
    );

    expect(repo.updateUserAudienceDefaults).toHaveBeenCalledWith("u-owner", expect.objectContaining({ city: "Recife" }));
  });

  it("parceiro: Público nunca grava em conta de admin", async () => {
    const repo = tenantRepo([partnerAdmin, member]);

    await new SuperAdminController(repo).updateAudience(
      { adminScope: { partnerId: "p-1" }, params: { tenantId: "t-1" }, body: { city: "Recife" } } as any, mockRes(), vi.fn(),
    );

    expect(repo.updateUserAudienceDefaults).toHaveBeenCalledWith("u-member", expect.anything());
  });
});
