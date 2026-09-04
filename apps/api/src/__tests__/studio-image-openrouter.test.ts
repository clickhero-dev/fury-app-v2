import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  generateImage: vi.fn(),
  chat: vi.fn(),
  findBrandKit: vi.fn(),
  createAsset: vi.fn(),
  enqueueCompliance: vi.fn(),
}));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { generateImage: state.generateImage, chat: state.chat },
}));

vi.mock('../lib/temp-storage.js', () => ({
  saveTemporaryStudioImage: vi.fn(async () => ({ fileName: 'tmp.png' })),
}));

vi.mock('../lib/queue.js', () => ({
  getComplianceQueue: vi.fn(async () => ({ add: state.enqueueCompliance })),
}));

vi.mock('../repository/studio.repository.js', () => ({
  StudioRepository: vi.fn().mockImplementation(function () {
    return {
      findBrandKit: state.findBrandKit,
      createAsset: state.createAsset,
    };
  }),
}));

import { generateImage } from '../services/studio/studio-image.service.js';

describe('generateImage (studio) sempre via OpenRouter — nunca DALL-E/OpenAI', () => {
  beforeEach(() => {
    state.generateImage.mockReset();
    state.chat.mockReset();
    state.findBrandKit.mockReset();
    state.createAsset.mockReset();
    state.enqueueCompliance.mockReset();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it('usa openrouterService.generateImage SEM depender de OPENAI_API_KEY', async () => {
    state.generateImage.mockResolvedValue('https://cdn.example.com/img.png');
    state.createAsset.mockResolvedValue({
      id: 'ast-img-1',
      tenantId: 't-1',
      type: 'image',
      url: 'https://cdn.example.com/img.png',
      complianceStatus: 'pending_compliance',
    });

    const out = await generateImage('cadeira ergonômica preta', 't-1', 'http://localhost:3000');

    expect(state.generateImage).toHaveBeenCalledTimes(1);
    expect(state.generateImage.mock.calls[0][0]).toMatchObject({
      model: expect.stringContaining('flux'),
      prompt: expect.stringContaining('cadeira ergonômica preta'),
    });
    expect(out).toMatchObject({ imageUrl: 'https://cdn.example.com/img.png', status: 'pending_compliance' });
  });
});