/**
 * Testes para updateSubscription (superadmin)
 * Cenários: criar trial, atualizar, inativar.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockSubFindFirst,
  mockPlanFindFirst,
  mockInsert,
  mockUpdate,
} = vi.hoisted(() => ({
  mockSubFindFirst: vi.fn(),
  mockPlanFindFirst: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@fury/db", () => ({
  db: {
    query: {
      subscriptions: { findFirst: mockSubFindFirst },
      plans: { findFirst: mockPlanFindFirst },
    },
    insert: vi.fn(() => ({ values: mockInsert })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: mockUpdate })),
    })),
  },
  subscriptions: {},
  plans: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ type: "eq", a, b })),
  desc: vi.fn(() => ({ type: "desc" })),
  tenants: {},
  users: {},
  furyConfig: {},
  brandKits: {},
  clientGoals: {},
}));

import { updateSubscription } from "../controllers/superadmin.controller.js";
import type { Request, Response, NextFunction } from "express";

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    params: { tenantId: "tenant-1" },
    body: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res = {} as Response;
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe("updateSubscription (superadmin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cria subscription quando nenhuma existe (trial)", async () => {
    mockSubFindFirst.mockResolvedValue(null);
    mockPlanFindFirst.mockResolvedValue({ id: "plan-1" });
    mockInsert.mockResolvedValue(undefined);

    const req = mockReq({
      body: {
        status: "trial",
        trialEndsAt: "2026-08-13T23:38:00.000Z",
      },
    });
    const res = mockRes();
    const next = mockNext();

    await updateSubscription(req, res, next);

    expect(mockSubFindFirst).toHaveBeenCalledTimes(1);
    // 2 chamadas: 1 para escolher um plano fallback (nenhum veio no body),
    // 1 para ler os limits do plano escolhido e definir creativesRemaining.
    expect(mockPlanFindFirst).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const inserted = mockInsert.mock.calls[0][0];
    expect(inserted).toMatchObject({
      tenantId: "tenant-1",
      planId: "plan-1",
      status: "trial",
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("cria subscription ativa com currentPeriodEnd (sem subscription)", async () => {
    mockSubFindFirst.mockResolvedValue(null);
    mockPlanFindFirst.mockResolvedValue({ id: "plan-1" });
    mockInsert.mockResolvedValue(undefined);

    const req = mockReq({
      body: {
        status: "active",
        currentPeriodEnd: "2026-08-13T23:38:00.000Z",
      },
    });
    const res = mockRes();
    const next = mockNext();

    await updateSubscription(req, res, next);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const inserted = mockInsert.mock.calls[0][0];
    expect(inserted).toMatchObject({
      tenantId: "tenant-1",
      status: "active",
    });
    expect(inserted.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it("usa planId do body quando fornecido (sem subscription)", async () => {
    mockSubFindFirst.mockResolvedValue(null);
    mockPlanFindFirst.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
    mockInsert.mockResolvedValue(undefined);

    const req = mockReq({
      body: { planId: "00000000-0000-4000-8000-000000000001", status: "trial" },
    });
    const res = mockRes();
    const next = mockNext();

    await updateSubscription(req, res, next);

    // Não busca plano fallback (planId já veio no body), mas ainda busca
    // o plano escolhido 1x para ler os limits e definir creativesRemaining.
    expect(mockPlanFindFirst).toHaveBeenCalledTimes(1);
    const inserted = mockInsert.mock.calls[0][0];
    expect(inserted.planId).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("retorna PLAN_REQUIRED quando não há plano algum no DB", async () => {
    mockSubFindFirst.mockResolvedValue(null);
    mockPlanFindFirst.mockResolvedValue(null);

    const req = mockReq({ body: { status: "trial" } });
    const res = mockRes();
    const next = mockNext();

    await updateSubscription(req, res, next);

    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("PLAN_REQUIRED");
  });

  it("atualiza subscription existente", async () => {
    mockSubFindFirst.mockResolvedValue({ id: "sub-1", tenantId: "tenant-1" });

    const req = mockReq({
      body: { status: "active", currentPeriodEnd: "2026-08-13T23:38:00.000Z" },
    });
    const res = mockRes();
    const next = mockNext();

    await updateSubscription(req, res, next);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("inativa subscription existente", async () => {
    mockSubFindFirst.mockResolvedValue({ id: "sub-1", tenantId: "tenant-1" });

    const req = mockReq({ body: { status: "inactive" } });
    const res = mockRes();
    const next = mockNext();

    await updateSubscription(req, res, next);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejeita status inválido via schema", async () => {
    const req = mockReq({ body: { status: "invalid_status" } });
    const res = mockRes();
    const next = mockNext();

    await updateSubscription(req, res, next);

    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err instanceof Error || err.statusCode).toBeTruthy();
  });
});
