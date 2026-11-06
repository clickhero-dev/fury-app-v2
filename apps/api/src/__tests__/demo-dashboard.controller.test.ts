/*
# Language: pt-BR

Funcionalidade: contrato seguro do Dashboard demonstrativo

  Cenário: conta demo recebe dados determinísticos sem consultar provedores
    Dado um tenant autenticado com slug fashion-demo
    Quando consulta o contrato do Dashboard demo
    Então recebe demo verdadeiro e métricas positivas com insights acionáveis

  Cenário: tenant real não recebe dados fictícios
    Dado um tenant autenticado com slug de cliente real
    Quando consulta o contrato do Dashboard demo
    Então recebe demo falso sem dataset demonstrativo

  Cenário: requisição sem tenant é recusada
    Dado uma requisição sem tenant autenticado
    Quando consulta o contrato do Dashboard demo
    Então recebe erro 401
*/
import { describe, expect, it, vi } from 'vitest';
import { DemoDashboardController } from '../controllers/demo-dashboard.controller.js';
import { DemoDashboardService } from '../services/dashboard/demo-dashboard.service.js';

function responseRecorder() {
  const json = vi.fn();
  return { json, status: vi.fn().mockReturnValue({ json }) };
}

describe('BDD: GET /v2/dashboard/demo', () => {
  it('Cenário: conta demo recebe dados determinísticos sem consultar provedores', async () => {
    const findTenant = vi.fn().mockResolvedValue({ slug: 'fashion-demo', isDemo: true });
    const controller = new DemoDashboardController(
      new DemoDashboardService(() => ({ findTenant } as never)),
    );
    const res = responseRecorder();
    const next = vi.fn();

    await controller.getDashboardDemo({ tenant: { tenantId: 'demo-tenant' } } as never, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(findTenant).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        demo: true,
        summary: expect.objectContaining({ conversions: expect.any(Number) }),
        insights: expect.objectContaining({ bestCreatives: expect.any(Array), tiredCreatives: expect.any(Array) }),
      }),
    }));
    const body = res.json.mock.calls[0][0];
    expect(body.data.summary.conversions).toBeGreaterThan(0);
  });

  it('Cenário: tenant real não recebe dados fictícios', async () => {
    const controller = new DemoDashboardController(
      new DemoDashboardService(() => ({ findTenant: vi.fn().mockResolvedValue({ slug: 'cliente-real' }) } as never)),
    );
    const res = responseRecorder();

    await controller.getDashboardDemo({ tenant: { tenantId: 'real-tenant' } } as never, res as never, vi.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { demo: false } }));
  });

  it('Cenário: requisição sem tenant é recusada', async () => {
    const controller = new DemoDashboardController(new DemoDashboardService(() => ({ findTenant: vi.fn() } as never)));
    const next = vi.fn();

    await controller.getDashboardDemo({} as never, responseRecorder() as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }));
  });
});
