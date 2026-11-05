import { describe, expect, it } from 'vitest';
import {
  completeGeneration,
  failGeneration,
  getEstimatedGenerationProgress,
  startGeneration,
  tickGeneration,
} from './creative-generation-progress';

/*
 * Funcionalidade: progresso visual da geração de imagem
 * Cenário: iniciar uma geração — Dado o usuário inicia, Quando o estado é criado, Então começa em zero.
 * Cenário: avançar — Dado geração em andamento, Quando o tempo avança, Então cresce sem chegar a 100%.
 * Cenário: atingir o limite — Dado mais de dois minutos, Quando o relógio atualiza, Então fica em 95%.
 * Cenário: confirmar — Dado confirmação do backend, Quando animação finaliza, Então chega em 100%.
 * Cenário: falhar — Dado erro do backend, Quando estado encerra, Então deixa de ser ativo.
 * Cenário: não regredir — Dado barra avançada, Quando chega relógio anterior, Então não volta para trás.
 */
describe('progresso visual da geração de imagem', () => {
  it('começa em zero e fica em processamento', () => {
    expect(startGeneration(1_000)).toEqual({ phase: 'generating', progress: 0, startedAt: 1_000 });
  });

  it('cresce gradualmente sem representar 100% antes da confirmação', () => {
    expect(getEstimatedGenerationProgress(60_000)).toBe(47);
    expect(getEstimatedGenerationProgress(119_999)).toBe(94);
  });

  it('fica limitado a 95% depois de dois minutos', () => {
    expect(tickGeneration(startGeneration(1_000), 121_000)).toEqual({ phase: 'generating', progress: 95, startedAt: 1_000 });
  });

  it('entra em conclusão em 95% e só pode ser exibido como 100% após a animação', () => {
    expect(completeGeneration(tickGeneration(startGeneration(1_000), 121_000))).toEqual({
      phase: 'completing', progress: 95, startedAt: 1_000,
    });
  });

  it('encerra em erro sem deixar a barra ativa', () => {
    const failed = failGeneration(tickGeneration(startGeneration(1_000), 30_000));
    expect(failed).toMatchObject({ phase: 'error', progress: 22 });
  });

  it('não regride quando recebe uma atualização de relógio anterior', () => {
    const progressed = tickGeneration(startGeneration(1_000), 61_000);
    expect(tickGeneration(progressed, 10_000).progress).toBe(progressed.progress);
  });
});
