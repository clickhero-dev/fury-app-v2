import { describe, it, expect, vi } from 'vitest';
import { validateAndUploadImage, getAspectRatio, getResolution, getExpectedDimensions } from '../../lib/image-validation.js';

vi.mock('../../services/storage/storage.service.js', () => ({
  uploadAsset: vi.fn().mockResolvedValue('https://r2.example.com/test.png'),
  deleteAsset: vi.fn().mockResolvedValue(undefined),
}));

describe('image-generation — lib/image-validation', () => {
  describe('getExpectedDimensions', () => {
    it('retorna dimensões corretas para feed', () => {
      const dim = getExpectedDimensions('feed');
      expect(dim).toEqual({ width: 1080, height: 1080, aspectRatio: '1:1' });
    });

    it('retorna dimensões corretas para carousel', () => {
      const dim = getExpectedDimensions('carousel');
      expect(dim).toEqual({ width: 1080, height: 1080, aspectRatio: '1:1' });
    });

    it('retorna dimensões corretas para image', () => {
      const dim = getExpectedDimensions('image');
      expect(dim).toEqual({ width: 1080, height: 1080, aspectRatio: '1:1' });
    });

    it('retorna dimensões corretas para stories', () => {
      const dim = getExpectedDimensions('stories');
      expect(dim).toEqual({ width: 1080, height: 1920, aspectRatio: '9:16' });
    });
  });

  describe('getAspectRatio', () => {
    it('retorna 1:1 para feed', () => {
      expect(getAspectRatio('feed')).toBe('1:1');
    });
    it('retorna 9:16 para stories', () => {
      expect(getAspectRatio('stories')).toBe('9:16');
    });
  });

  describe('getResolution', () => {
    it('retorna 1080x1080 para feed', () => {
      expect(getResolution('feed')).toBe('1080x1080');
    });
    it('retorna 1080x1920 para stories', () => {
      expect(getResolution('stories')).toBe('1080x1920');
    });
  });

  describe('validateAndUploadImage', () => {
    const smallBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9mH9kAAAAASUVORK5CYII='; // 1x1 pixel

    it('falha se imagem menor que 0.05 MB', async () => {
      await expect(validateAndUploadImage(smallBase64, 'feed', 1, 'tenant-1'))
        .rejects.toThrow('Imagem muito pequena');
    });

    it('falha se formato inválido', async () => {
      // 0.5 MB = 524288 bytes = ~699k base64 chars
      const gifBase64 = 'data:image/gif;base64,' + 'A'.repeat(700000); // ~0.52 MB decoded
      await expect(validateAndUploadImage(gifBase64, 'feed', 1, 'tenant-1'))
        .rejects.toThrow(/Formato de imagem inválido|Input buffer contains unsupported image format/);
    });
  });
});

describe('image-generation — workflow integration', () => {
  it('workflow plannerWorkflow inclui stage image-generation', async () => {
    vi.resetModules();
    const { plannerWorkflow } = await import('../../agents/orchestrator.js');
    
    const stageIds = plannerWorkflow.stages.map(s => s.id);
    expect(stageIds).toContain('image-generation');
    
    const imageStage = plannerWorkflow.stages.find(s => s.id === 'image-generation');
    expect(imageStage).toBeDefined();
    expect(imageStage?.deps).toEqual(['creative', 'planner']);
    expect(imageStage?.artifactKey).toBe('images');
    expect(imageStage?.retryPolicy).toEqual({ maxAttempts: 3, backoffMs: 2000, backoffType: 'exponential' });
    expect(imageStage?.rollback).toBeDefined();
  });

  it('stage image-generation está na ordem correta (após creative, antes de quality)', async () => {
    vi.resetModules();
    const { plannerWorkflow } = await import('../../agents/orchestrator.js');
    
    const stageIds = plannerWorkflow.stages.map(s => s.id);
    const creativeIdx = stageIds.indexOf('creative');
    const imageIdx = stageIds.indexOf('image-generation');
    const qualityIdx = stageIds.indexOf('quality');
    
    expect(creativeIdx).toBeLessThan(imageIdx);
    expect(imageIdx).toBeLessThan(qualityIdx);
  });

  it('job-status-adapter exporta constantes corretas', async () => {
    // Testa via orchestrator que usa o adapter internamente
    vi.resetModules();
    const { PLANNER_AGENT_NAMES } = await import('../../agents/orchestrator.js');
    
    expect(PLANNER_AGENT_NAMES).toContain('Image Generation Agent');
    
    const creativeIdx = PLANNER_AGENT_NAMES.indexOf('Creative Agent');
    const imageIdx = PLANNER_AGENT_NAMES.indexOf('Image Generation Agent');
    const qualityIdx = PLANNER_AGENT_NAMES.indexOf('Quality Agent');
    
    expect(creativeIdx).toBeLessThan(imageIdx);
    expect(imageIdx).toBeLessThan(qualityIdx);
  });
});