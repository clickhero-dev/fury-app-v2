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
import { AutomationController } from './controllers/automation.controller.js';
import { AuthService } from './services/core/auth.service.js';
import { SocialAuthService } from './services/core/social-auth.service.js';
import { AuthController } from './controllers/auth.controller.js';
import { MetricsService } from './services/campaigns/metrics.service.js';
import { MetricsController } from './controllers/metrics.controller.js';
import { GoogleService, googleService } from './services/google/google.service.js';
import { GoogleController } from './controllers/google.controller.js';
import { MetaService, metaService } from './services/meta/meta.service.js';
import { MetaController } from './controllers/meta.controller.js';
import { instagramService } from './services/meta/instagram.service.js';
import { InstagramController } from './controllers/instagram.controller.js';
import { getInstagramDashboardInsights } from './services/meta/instagram.service.js';
import { plannerService } from './services/planner/planner.service.js';
import { PlannerController } from './controllers/planner.controller.js';
import { DashboardController } from './controllers/dashboard.controller.js';
import { BudgetOptimizerService } from './services/campaigns/budget-optimizer.service.js';
import { BudgetController } from './controllers/budget.controller.js';

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
export const authService = new AuthService();
export const socialAuthService = new SocialAuthService();
export const metricsService = new MetricsService(metricsProvider);
export const budgetOptimizerService = new BudgetOptimizerService();

export const controllers = {
  goal: new GoalController(goalService),
  brandKit: new BrandKitController(brandKitService),
  fury: new FuryController(furyEngineService),
  openrouter: new OpenRouterController(openRouterStudioService),
  studio: new CreativeStudioController(studioService),
  billing: new BillingController(billingService),
  observability: new ObservabilityController(observabilityService),
  forms: new FormsController(formsService),
  metrics: new MetricsController(metricsService),
  auth: new AuthController(authService, socialAuthService),
  automation: new AutomationController(automationService),
  google: new GoogleController(googleService),
  meta: new MetaController(metaService),
  instagram: new InstagramController(instagramService, metaService),
  planner: new PlannerController(plannerService),
  dashboard: new DashboardController(getInstagramDashboardInsights),
  budget: new BudgetController(budgetOptimizerService),
};

export { metricsProvider };