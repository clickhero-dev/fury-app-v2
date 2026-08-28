import { AppError } from '../../middleware/errorHandler.js';
import { AutomationRepository } from '../../repository/automation.repository.js';

type AutomationRule = Awaited<ReturnType<AutomationRepository['createAutomationRule']>>;

export class AutomationService {
  constructor(
    private repoFactory: (tenantId: string) => AutomationRepository = (t) => new AutomationRepository(t),
  ) {}

  private repo(tenantId: string): AutomationRepository {
    return this.repoFactory(tenantId);
  }

  async createAutomationRule(args: { tenantId: string; name: string; description?: string; trigger: string; threshold: number; action: string; enabled?: boolean }) {
    if (args.threshold < 0) throw new AppError(400, 'INVALID_THRESHOLD', 'Threshold cannot be negative');
    return this.repo(args.tenantId).createAutomationRule({
      name: args.name,
      description: args.description,
      trigger: args.trigger,
      ruleType: args.trigger,
      threshold: args.threshold.toString(),
      action: args.action,
      isActive: args.enabled ?? true,
    });
  }

  async getAutomationRules(tenantId: string) {
    const rules = await this.repo(tenantId).listAutomationRules();
    return rules.map((rule) => ({ ...rule, threshold: parseInt(rule.threshold, 10), enabled: rule.isActive }));
  }

  /**
   * Upsert de regra por nome (find-by-name → update ou create).
   * Retorna `created` para o controller decidir 201 (nova) vs 200 (atualizada).
   */
  async upsertAutomationRule(args: {
    tenantId: string;
    name: string;
    trigger: string;
    ruleType?: string;
    isActive: boolean;
    threshold: number;
    action: string;
    description?: string;
  }): Promise<{ rule: AutomationRule; created: boolean }> {
    const repo = this.repo(args.tenantId);
    const existing = await repo.findAutomationRuleByName(args.name);

    if (existing) {
      const updated = await repo.updateAutomationRule(existing.id, {
        name: args.name,
        trigger: args.trigger,
        ruleType: args.ruleType,
        isActive: args.isActive,
        threshold: args.threshold.toString(),
        action: args.action,
        description: args.description,
      });
      return { rule: updated ?? existing, created: false };
    }

    const created = await repo.createAutomationRule({
      name: args.name,
      trigger: args.trigger,
      ruleType: args.ruleType || args.trigger,
      isActive: args.isActive,
      threshold: args.threshold.toString(),
      action: args.action,
      description: args.description,
    });
    return { rule: created, created: true };
  }

  /** Deleta uma regra do tenant (throws 403 se não pertencer a ele). */
  async deleteAutomationRuleById(tenantId: string, id: string): Promise<void> {
    const repo = this.repo(tenantId);
    const existing = await repo.findAutomationRuleById(id);
    if (!existing) {
      throw new AppError(403, 'FORBIDDEN', 'Rule not found or does not belong to this tenant');
    }
    await repo.deleteAutomationRule(id);
  }

  /** Smart takedowns (furyInsights) do tenant. */
  async getSmartTakedowns(tenantId: string) {
    return this.repo(tenantId).listSmartTakedowns();
  }

  /** Distribuição inteligente de orçamento conforme ROAS das campanhas. */
  getBudgetSmart(monthlyBudget: number) {
    const campaigns = [
      {
        id: '1',
        name: 'Campanha Leads',
        budget: 500,
        metrics: { roas: 4.5 },
      },
      {
        id: '2',
        name: 'Campanha Conversão',
        budget: 300,
        metrics: { roas: 2.8 },
      },
    ];

    if (!campaigns.length) {
      return {
        monthlyBudget,
        distribution: [],
        previsao: {
          leadsEstimados: Math.round(monthlyBudget / 50),
          vendasEstimadas: Math.round(monthlyBudget / 150),
          roasEsperado: 3.2,
          resumo: `Com R$${monthlyBudget}/mês, estimamos ${Math.round(
            monthlyBudget / 50,
          )} leads a um CPA médio de R$50.`,
        },
      };
    }

    const sortedCampaigns = campaigns.sort((a, b) => b.metrics.roas - a.metrics.roas);

    const totalRoas = sortedCampaigns.reduce((acc, campaign) => acc + campaign.metrics.roas, 0);

    const distribution = sortedCampaigns.map((campaign) => {
      const percentage = campaign.metrics.roas / totalRoas;

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        currentBudget: campaign.budget,
        suggestedBudget: Math.round(monthlyBudget * percentage),
        roas: campaign.metrics.roas,
      };
    });

    return {
      monthlyBudget,
      distribution,
      previsao: {
        leadsEstimados: Math.round(monthlyBudget / 45),
        vendasEstimadas: Math.round(monthlyBudget / 160),
        roasEsperado: 3.8,
        resumo: `Com R$${monthlyBudget}/mês, a distribuição inteligente prioriza campanhas com maior ROAS, aumentando potencial de conversão e retorno.`,
      },
      diasRestantes: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0,
      ).getDate() - new Date().getDate(),
    };
  }
}