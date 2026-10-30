import { describe, it, expect, vi, beforeEach } from "vitest";
import { SuperAdminController } from "../controllers/superadmin.controller.js";
import { countExpiredAccounts, mapRecentActivity } from "../repository/superadmin.repository.js";

function mockRepo() {
  return { getDashboardStats: vi.fn() };
}
function mockRes() {
  const res = {} as any;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("mapRecentActivity (puro, sem DB)", () => {
  const base = { tenantName: "Loja Moda SP", planName: "Pro" };

  it("ciclo completo: trial → plano → cancelamento", () => {
    const subs = [
      { status: "trial", createdAt: new Date("2026-09-01T10:00:00Z"), updatedAt: new Date("2026-09-01T10:00:00Z"), ...base },
      { status: "active", createdAt: new Date("2026-09-02T10:00:00Z"), updatedAt: new Date("2026-09-02T10:00:00Z"), ...base },
      { status: "cancelled", createdAt: new Date("2026-08-01T10:00:00Z"), updatedAt: new Date("2026-09-03T10:00:00Z"), ...base },
    ];
    const items = mapRecentActivity(subs as any, []);
    expect(items.map((i) => i.tipo)).toEqual(["cancelamento", "plano", "trial"]);
    expect(items[0].description).toBe("cancelou o plano Pro");
    expect(items[1].description).toBe("assinou o plano Pro");
    expect(items[2].description).toBe("iniciou período trial do plano Pro");
  });

  it("novos tenants entram como 'novo' e limite é 10", () => {
    const subs = Array.from({ length: 8 }, (_, i) => ({
      status: "active" as const,
      createdAt: new Date(2026, 8, i + 1),
      updatedAt: new Date(2026, 8, i + 1),
      tenantName: `T${i}`,
      planName: "Pro",
    }));
    const tenants = Array.from({ length: 4 }, (_, i) => ({ name: `N${i}`, createdAt: new Date(2026, 8, i + 20) }));
    const items = mapRecentActivity(subs as any, tenants as any);
    expect(items.length).toBe(10);
    expect(items.some((i) => i.tipo === "novo")).toBe(true);
  });

  it("renovação persistida aparece como atividade de plano, sem alegar pagamento", () => {
    const items = mapRecentActivity([], [], [
      { tenantName: "Loja Moda SP", renewedAt: new Date("2026-09-04T10:00:00Z"), previousPeriodEnd: new Date("2026-09-03T10:00:00Z") },
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        tipo: "renovacao",
        tenantName: "Loja Moda SP",
        description: "renovou o período do plano",
        at: "2026-09-04T10:00:00.000Z",
      }),
    ]);
  });
});

describe("countExpiredAccounts", () => {
  it("conta tenants distintos e exclui estados sem vencimento elegível", () => {
    const now = new Date("2026-09-20T00:00:00.000Z");
    const rows = [
      { tenantId: "t1", status: "active", isNonExpirable: false, currentPeriodEnd: new Date("2026-09-19T00:00:00.000Z") },
      { tenantId: "t1", status: "active", isNonExpirable: false, currentPeriodEnd: new Date("2026-09-18T00:00:00.000Z") },
      { tenantId: "t2", status: "active", isNonExpirable: false, currentPeriodEnd: now },
      { tenantId: "t3", status: "active", isNonExpirable: true, currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z") },
      { tenantId: "t4", status: "trial", isNonExpirable: false, currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z") },
      { tenantId: "t5", status: "cancelled", isNonExpirable: false, currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z") },
      { tenantId: "t6", status: "active", isNonExpirable: false, currentPeriodEnd: null },
      { tenantId: "t7", status: "active", isNonExpirable: false, currentPeriodEnd: new Date("2026-09-21T00:00:00.000Z") },
    ];

    expect(countExpiredAccounts(rows, now)).toBe(2);
  });
});

describe("SuperAdminController.getDashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("period válido → 200 com stats", async () => {
    const repo = mockRepo();
    const stats = { mrrCents: 10000, activeClients: 2, newClients: 1, activeTrials: 1, cancellations: 0, plans: [], recentActivity: [] };
    repo.getDashboardStats.mockResolvedValue(stats);
    const ctrl = new SuperAdminController(repo as any);
    const res = mockRes();

    await ctrl.getDashboard({ query: { period: "30d" } } as any, res, vi.fn() as any);

    expect(repo.getDashboardStats).toHaveBeenCalledWith("30d");
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: stats }));
  });

  it("period inválido → propaga ZodError (400) e não toca o repo", async () => {
    const repo = mockRepo();
    const ctrl = new SuperAdminController(repo as any);
    const next = vi.fn();

    await ctrl.getDashboard({ query: { period: "30" } } as any, mockRes(), next);

    expect(repo.getDashboardStats).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: "ZodError" }));
  });
});