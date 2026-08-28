import { DatabaseMetricsProvider } from './lib/providers/db-metrics.provider.js';
import { MockMetricsProvider } from './lib/providers/mock-metrics.provider.js';
import type { IMetricsProvider } from './lib/providers/metrics.provider.js';
import { GoalService } from './services/goals/goal.service.js';
import { GoalController } from './controllers/goal.controller.js';

/**
 * Composition root (DI) da API.
 *
 * Instancia uma vez: repositórios, serviços externos, services-classe e controllers.
 * As rotas/controllers importam os singletons daqui — nunca fazem `new <Service>()`
 * dentro de handlers. Novos domínios adicionam suas instâncias aqui (Fase 0 — ADR-0001).
 */
const metricsProvider: IMetricsProvider =
  process.env.META_USE_MOCK === 'true' && process.env.NODE_ENV !== 'production'
    ? new MockMetricsProvider()
    : new DatabaseMetricsProvider();

export const goalService = new GoalService(metricsProvider);

export const controllers = {
  goal: new GoalController(goalService),
};

export { metricsProvider };