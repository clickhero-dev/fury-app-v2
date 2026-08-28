import { describe, it, expect, vi } from 'vitest';
import { AutomationService } from '../services/automation/automation.service.js';

function makeRepo(override: Record<string, any> = {}) {
  return {
    createAutomationRule: vi.fn(async (d: any) => ({ id: 'r1', ...d })),
    listAutomationRules: vi.fn(async () => [{ id: 'r1', threshold: '75', isActive: true }]),
    ...override,
  };
}
let repo: any = makeRepo();
const svc = new AutomationService(() => repo as any);

describe('AutomationService', () => {
  it('createAutomationRule converte threshold para string', async () => {
    await svc.createAutomationRule({ tenantId: 't-1', name: 'X', trigger: 'cpa', threshold: 75, action: 'pause' });
    expect(repo.createAutomationRule).toHaveBeenCalledWith(expect.objectContaining({ threshold: '75', isActive: true }));
  });

  it('createAutomationRule valida threshold negativo', async () => {
    await expect(svc.createAutomationRule({ tenantId: 't-1', name: 'X', trigger: 'cpa', threshold: -1, action: 'pause' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('getAutomationRules mapeia threshold p/ number e enabled', async () => {
    const rules = await svc.getAutomationRules('t-1');
    expect(rules[0]).toMatchObject({ threshold: 75, enabled: true });
  });
});