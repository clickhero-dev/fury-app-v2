import { describe, expect, it } from 'vitest';
import {
  completeGeneration,
  failGeneration,
  getEstimatedGenerationProgress,
  startGeneration,
  tickGeneration,
  type GenerationProgressState,
} from './creative-generation-progress';

/*
 * Funcionalidade: progresso visual da geração de imagem
 * Cenário: iniciar uma geração
 * Dado que o usuário inicia uma geração
 * Quando o estado visual é criado
 * Então a barra começa em zero e fica em processamento
 *
 * Cenário: avançar sem expor percentual real
 * Dado que a geração está em andamento
 * Quando o tempo estimado avança
 * Então o progresso cresce gradualmente e permanece abaixo de 100%
 *
 * Cenário: atingir o limite sem confirmação
 * Dado que a geração ultrapassa dois minutos
 * Quando o relógio é atualizado
 * Então a barra permanece em 95% e continua em processamento
 *
 * Cenário: confirmar a geração
 * Dado que o backend confirma a geração
 * Quando a animação finaliza
 * Então a barra chega a 100% e o estado fica concluído
 *
 * Cenário: falhar a geração
 * Dado que o backend retorna um erro
 * Quando o estado é encerrado
 * Então o progresso deixa de ser ativo sem ficar em 100%
 *
 * Cenário: não regredir ao receber atualizações
 * Dado que a barra já avançou
 * Quando chega uma atualização com relógio anterior
 * Então o progresso não volta para trás
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
    const state = startGeneration(1_000);

    expect(tickGeneration(state, 121_000)).toEqual({ phase: 'generating', progress: 95, startedAt: 1_000 });
  });

  it('completa em 100% somente depois da animação final', () => {
    const completing = completeGeneration(tickGeneration(startGeneration(1_000), 121_000));

    expect(completing).toEqual({ phase: 'completing', progress: 95, startedAt: 1_000 });
    expect({ ...completing, phase: 'complete', progress: 100 }).toEqual({
      phase: 'complete',
      progress: 100,
      startedAt: 1_000,
    });
  });

  it('encerra em erro sem deixar a barra ativa ou em 100%', () => {
    const failed = failGeneration(tickGeneration(startGeneration(1_000), 30_000));

    expect(failed.phase).toBe('error');
    expect(failed.progress).toBe(22);
  });

  it('não regride quando recebe uma atualização de relógio anterior', () => {
    const progressed: GenerationProgressState = tickGeneration(startGeneration(1_000), 61_000);

    expect(tickGeneration(progressed, 10_000).progress).toBe(progressed.progress);
  });
});
