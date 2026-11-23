import { rbacService } from '../services/core/rbac.service.js';

// workers: pula o cliente se o plano ou o parceiro tira TODAS estas funcionalidades; erro = pula
export async function planSkipsTenant(tenantId: string, viewKeys: string[], tag: string): Promise<boolean> {
  try {
    for (const key of viewKeys) if (!(await rbacService.tenantBlocks(tenantId, key))) return false;
    return true;
  } catch (err) {
    console.error(`[${tag}] falha ao ler o plano do tenant ${tenantId}; pulando:`, (err as Error).message);
    return true;
  }
}
