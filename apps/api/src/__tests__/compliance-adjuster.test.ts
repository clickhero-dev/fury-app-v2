import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  openRouterChat: vi.fn(),
  generateImage: vi.fn(),
  findAssetById: vi.fn(),
  patchAsset: vi.fn(),
  findPostByImageUrl: vi.fn(),
  updatePostImage: vi.fn(),
  consumeQuota: vi.fn(),
  enqueueCompliance: vi.fn(),
}));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { chat: state.openRouterChat, generateImage: state.generateImage },
}));

vi.mock('../services/studio/creative-quota.service.js', () => ({
  consumeCreativeQuota: state.consumeQuota,
}));

vi.mock('../lib/queue.js', () => ({
  getComplianceQueue: vi.fn(async () => ({ add: state.enqueueCompliance })),
}));

vi.mock('../repository/studio.repository.js', () => ({
  StudioRepository: vi.fn().mockImplementation(function () {
    return {
      findAssetById: state.findAssetById,
      patchAsset: state.patchAsset,
    };
  }),
}));

vi.mock('../repository/planner.repository.js', () => ({
  PlannerRepository: vi.fn().mockImplementation(function () {
    return {
      findPostByImageUrl: state.findPostByImageUrl,
      updatePostImage: state.updatePostImage,
    };
  }),
}));

vi.mock('../services/storage/storage.service.js', () => ({
  uploadAsset: vi.fn(async () => 'https://cdn.example.com/nova.png'),
}));

import { complianceAdjuster, MAX_COMPLIANCE_ATTEMPTS } from '../services/studio/compliance-adjuster.service.js';

const ISSUE = 'Logotipo de odontologia em anúncio de padaria.';
const REJECTED_NOTES = `[COMPLIANCE] original_prompt="pão artesanal" | approved=false | data={"approved":false,"issues":["${ISSUE}"],"text_percentage":25}`;

function makeAsset(overrides: Record<string, any> = {}) {
  return {
    id: 'asset-adj-1',
    tenantId: 't-1',
    type: 'image',
    url: 'https://r2.old.png',
    complianceStatus: 'rejected',
    complianceAttempts: 0,
    complianceNotes: REJECTED_NOTES,
    ...overrides,
  };
}

describe('complianceAdjuster.handleRejected', () => {
  beforeEach(() => {
    Object.values(state).forEach((fn) => (fn as any).mockReset?.());
    delete process.env.OPENAI_API_KEY;
    delete process.env.R2_ENDPOINT;
    state.enqueueCompliance.mockResolvedValue(undefined);
  });

  it('reescreve o prompt com o LLM e regenera SEM logoUrl e SEM desconto de cota', async () => {
    state.findAssetById.mockResolvedValue(makeAsset());
    state.openRouterChat.mockResolvedValue('pão artesanal, sem logotipos, texto mínimo');
    state.generateImage.mockResolvedValue('data:image/png;base64,NOVAIMAGEM==');
    state.patchAsset.mockResolvedValue({ id: 'asset-adj-1' });

    await complianceAdjuster.handleRejected({ creativeAssetId: 'asset-adj-1', tenantId: 't-1' });

    // reescreveu com o LLM usando os issues da recusa
    expect(state.openRouterChat).toHaveBeenCalledTimes(1);
    const chatMessages = state.openRouterChat.mock.calls[0][0] as any[];
    expect(chatMessages[1].content).toContain(ISSUE);
    // gerou nova imagem com o prompt reescrito e SEM logoUrl
    expect(state.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'pão artesanal, sem logotipos, texto mínimo',
        model: expect.stringContaining('flux'),
      })
    );
    const genOpts = state.generateImage.mock.calls[0][0];
    expect(genOpts.logoUrl).toBeUndefined();
    // sem cota
    expect(state.consumeQuota).not.toHaveBeenCalled();
    // patcheou o MESMO asset com attempts+1 e re-enfileirou compliance
    expect(state.patchAsset).toHaveBeenCalledWith(
      'asset-adj-1',
      expect.objectContaining({ complianceAttempts: 1, complianceStatus: 'pending_compliance' })
    );
    expect(state.enqueueCompliance).toHaveBeenCalledWith(
      'compliance-check',
      expect.objectContaining({ creativeAssetId: 'asset-adj-1', tenantId: 't-1' }),
      expect.anything()
    );
  });

  it('para após 5 tentativas — não gera nem patcheia', async () => {
    state.findAssetById.mockResolvedValue(makeAsset({ complianceAttempts: MAX_COMPLIANCE_ATTEMPTS }));
    await complianceAdjuster.handleRejected({ creativeAssetId: 'asset-adj-1', tenantId: 't-1' });

    expect(state.generateImage).not.toHaveBeenCalled();
    expect(state.patchAsset).not.toHaveBeenCalled();
    expect(state.enqueueCompliance).not.toHaveBeenCalled();
  });

  it('planner: encontra o post pela URL da imagem e atualiza o post com a nova imagem', async () => {
    state.findAssetById.mockResolvedValue(
      makeAsset({ complianceNotes: '[COMPLIANCE] approved=false | data={"approved":false,"issues":["x"],"text_percentage":20}' })
    );
    state.findPostByImageUrl.mockResolvedValue({ id: 'post-9', imagePrompt: 'prompt original do post' });
    state.openRouterChat.mockResolvedValue('prompt ajustado do post');
    state.generateImage.mockResolvedValue('data:image/png;base64,NOVA2==');
    state.patchAsset.mockResolvedValue({ id: 'asset-adj-1' });

    await complianceAdjuster.handleRejected({ creativeAssetId: 'asset-adj-1', tenantId: 't-1' });

    expect(state.findPostByImageUrl).toHaveBeenCalledWith('https://r2.old.png');
    expect(state.updatePostImage).toHaveBeenCalledWith('post-9', 'data:image/png;base64,NOVA2==');
    expect(state.generateImage.mock.calls[0][0].prompt).toBe('prompt ajustado do post');
  });

  it('fallback determinístico quando o LLM falha — usa o prompt original + os issues', async () => {
    state.findAssetById.mockResolvedValue(makeAsset());
    state.openRouterChat.mockRejectedValue(new Error('OPENROUTER_API_KEY_MISSING'));
    state.generateImage.mockResolvedValue('data:image/png;base64,FALLBACK==');
    state.patchAsset.mockResolvedValue({ id: 'asset-adj-1' });

    await complianceAdjuster.handleRejected({ creativeAssetId: 'asset-adj-1', tenantId: 't-1' });

    const prompt = state.generateImage.mock.calls[0][0].prompt;
    expect(prompt).toContain('pão artesanal');
    expect(prompt).toContain(ISSUE);
    expect(state.consumeQuota).not.toHaveBeenCalled();
  });
});