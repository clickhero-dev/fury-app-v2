import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudioService } from '../services/studio/creative-studio.service.js';

function makeRepo(override: Record<string, any> = {}) {
  return {
    findTenant: vi.fn(async () => ({ name: 'Negócio X' })),
    findClientGoal: vi.fn(async () => ({ objective: 'aumentar vendas' })),
    findBrandKit: vi.fn(async () => null),
    createAsset: vi.fn(async (d: any) => ({ id: 'ass-1', ...d })),
    findAssetById: vi.fn(async () => ({ id: 'a1', complianceNotes: '{}', tenantId: 't-1' })),
    ...override,
  };
}

let repo: any = makeRepo();
const deps: any = {
  llm: { chat: vi.fn(async () => '{"valid": true, "resumo": "ok"}') },
  storage: { uploadAsset: vi.fn(async () => 'https://cdn/x.png') },
  copy: { generateAdCopy: vi.fn(async () => ({ variacoes: [] })) },
};
const svc = new StudioService(() => repo as any, deps);

describe('StudioService', () => {
  beforeEach(() => { repo = makeRepo(); });

  it('getTenantContext retorna businessName e objetivo', async () => {
    const ctx = await svc.getTenantContext('t-1');
    expect(ctx).toEqual({ businessName: 'Negócio X', objective: 'aumentar vendas' });
  });

  it('getBrandKitContext sem kit → {}', async () => {
    await expect(svc.getBrandKitContext('t-1')).resolves.toEqual({});
  });

  it('generateAdCopy delega para o serviço de copy', async () => {
    await svc.generateAdCopy({ objective: 'o', product: 'p', audience: 'a', tone: 'casual', quantity: 3 }, 't-1');
    expect(deps.copy.generateAdCopy).toHaveBeenCalled();
  });

  it('generateCopyLegacy sem OPENROUTER_API_KEY → variações mock (3-5)', async () => {
    delete (process.env as any).OPENROUTER_API_KEY;
    const out = await svc.generateCopyLegacy({ produto: 'X', publico: 'Y' }, 'descricao', 4);
    expect(out.variacoes).toHaveLength(4);
    expect(out.variacoes[0]).toHaveProperty('pontuacao');
  });

  it('generateCopyLegacy com OPENROUTER_API_KEY → variações do LLM (OpenRouter)', async () => {
    (process.env as any).OPENROUTER_API_KEY = 'test-or-key';
    (deps.llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue(
      '{"variacoes":[{"texto":"Compre agora"},{"texto":"Garanta hoje"}]}',
    );
    const out = await svc.generateCopyLegacy({ produto: 'X', publico: 'Y' }, 'descricao', 5);
    expect(deps.llm.chat).toHaveBeenCalled();
    expect(out.variacoes).toHaveLength(2);
    expect(out.variacoes[0].texto).toBe('Compre agora');
    expect(out.variacoes[0]).toHaveProperty('pontuacao');
  });

  it('validateContext usa llm.chat e retorna JSON parseado', async () => {
    (deps.llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue('{"valid": true, "resumo": "ok"}');
    const out = await svc.validateContext('t-1', { product: 'p', promise: 'q', offer: 'r', audience: 'a' });
    expect(deps.llm.chat).toHaveBeenCalled();
    expect(out).toEqual({ valid: true, resumo: 'ok' });
  });
});