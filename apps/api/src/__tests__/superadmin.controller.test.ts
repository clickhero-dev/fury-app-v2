import { describe, it, expect, vi, beforeEach } from "vitest";
import { SuperAdminController } from "../controllers/superadmin.controller.js";

function mockRepo() {
  return {
    listTenants: vi.fn(),
    countUsersByTenant: vi.fn(),
    findLatestSubscriptionByTenant: vi.fn(),
    findPlanById: vi.fn(),
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

    await c.listTenants({ params: {}, query: {} } as any, res, next);

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

    await c.listUsers({ query: { page: "1", limit: "10", search: "" } } as any, res, next);

    expect(repo.paginateUsersAdmin).toHaveBeenCalledWith("", 10, 0);
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

    await c.createUser(
      {
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

    await c.listPlans({ params: {}, query: {} } as any, res, next);

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

    await c.createUser(
      {
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

  it("getTenant com tenant inexistente propaga 404 TENANT_NOT_FOUND", async () => {
    const repo = mockRepo();
    repo.getTenantById.mockResolvedValue(null);

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.getTenant({ params: { id: "t-0" } } as any, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: "TENANT_NOT_FOUND" }),
    );
  });

  it("updatePlan com plano inexistente propaga 404 PLAN_NOT_FOUND", async () => {
    const repo = mockRepo();
    repo.findPlanById.mockResolvedValue(null);

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.updatePlan({ params: { id: "plan-0" }, body: { name: "X" } } as any, res, next);

    expect(repo.updatePlan).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: "PLAN_NOT_FOUND" }),
    );
  });

  it("deletePlan com assinantes e sem migrateTo propaga 409 PLAN_HAS_SUBSCRIBERS", async () => {
    const repo = mockRepo();
    repo.findPlanById.mockResolvedValue({ id: "plan-1" });
    repo.countSubscriptionsByPlan.mockResolvedValue(2);

    const c = new SuperAdminController(repo as any);
    const res = mockRes();
    const next = vi.fn();

    await c.deletePlan({ params: { id: "plan-1" }, query: {} } as any, res, next);

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