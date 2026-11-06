import { describe, expect, it } from 'vitest';
import {
  getEstimatedImageGenerationProgress,
  getMonotonicImageGenerationProgress,
  IMAGE_GENERATION_ESTIMATE_MS,
  IMAGE_GENERATION_PROGRESS_CAP,
} from '../imageGenerationProgress';

describe('Progresso estimado da geração de imagem', () => {
  it('Dado que a geração acabou de iniciar, quando o progresso é calculado, então começa em 0%', () => {
    expect(getEstimatedImageGenerationProgress(0)).toBe(0);
  });

  it('Dado que a geração está em andamento, quando passa metade da estimativa, então avança suavemente sem chegar a 95%', () => {
    expect(getEstimatedImageGenerationProgress(IMAGE_GENERATION_ESTIMATE_MS / 2)).toBe(47.5);
  });

  it('Dado que a geração ainda não foi confirmada após 120 segundos, quando o progresso é calculado, então permanece limitado a 95%', () => {
    expect(getEstimatedImageGenerationProgress(IMAGE_GENERATION_ESTIMATE_MS)).toBe(IMAGE_GENERATION_PROGRESS_CAP);
    expect(getEstimatedImageGenerationProgress(IMAGE_GENERATION_ESTIMATE_MS * 3)).toBe(IMAGE_GENERATION_PROGRESS_CAP);
  });

  it('Dado que uma re-renderização informa um valor anterior, quando o progresso é reconciliado, então ele não regride', () => {
    expect(getMonotonicImageGenerationProgress(70, IMAGE_GENERATION_ESTIMATE_MS / 2)).toBe(70);
  });
});
