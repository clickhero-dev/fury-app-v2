import { describe, it, expect, vi, beforeEach } from "vitest";
import { SuperAdminController } from "../controllers/superadmin.controller.js";
import { mapRecentActivity } from "../repository/superadmin.repository.js";

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