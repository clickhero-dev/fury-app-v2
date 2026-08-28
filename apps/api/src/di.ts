import { DatabaseMetricsProvider } from './lib/providers/db-metrics.provider.js';
import { MockMetricsProvider } from './lib/providers/mock-metrics.provider.js';
import type { IMetricsProvider } from './lib/providers/metrics.provider.js';
import { GoalService } from './services/goals/goal.service.js';
import { GoalController } from './controllers/goal.controller.js';
import { BrandKitService } from './services/brand-kit/brand-kit.service.js';
import { BrandKitController } from './controllers/brand-kit.controller.js';
import { FuryEngineService } from './services/fury/fury-engine.service.js';
import { FuryController } from './controllers/fury.controller.js';
import { OpenRouterStudioService } from './services/openrouter/openrouter-studio.service.js';
import { OpenRouterController } from './controllers/openrouter.controller.js';
import { StudioService } from './services/studio/creative-studio.service.js';
import { CreativeStudioController } from './controllers/creative-studio.controller.js';
import { BillingService } from './services/billing/billing.service.js';
import { BillingController } from './controllers/billing.controller.js';
import { ObservabilityService } from './services/observability/observability.service.js';
import { ObservabilityController } from './controllers/observability.controller.js';
import { FormsService } from './services/forms/forms.service.js';
import { FormsController } from './controllers/forms.controller.js';
import { AutomationService } from './services/automation/automation.service.js';

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
export const brandKitService = new BrandKitService();
export const furyEngineService = new FuryEngineService();
export const openRouterStudioService = new OpenRouterStudioService();
export const studioService = new StudioService();
export const billingService = new BillingService();
export const observabilityService = new ObservabilityService();
export const formsService = new FormsService();
export const automationService = new AutomationService();

export const controllers = {
  goal: new GoalController(goalService),
  brandKit: new BrandKitController(brandKitService),
  fury: new FuryController(furyEngineService),
  openrouter: new OpenRouterController(openRouterStudioService),
  studio: new CreativeStudioController(studioService),
  billing: new BillingController(billingService),
  observability: new ObservabilityController(observabilityService),
  forms: new FormsController(formsService),
};

export { metricsProvider };