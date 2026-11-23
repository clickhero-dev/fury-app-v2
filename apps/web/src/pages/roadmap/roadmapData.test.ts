/*
Funcionalidade: manter o contrato do conteúdo público do Roadmap

Cenário: resumo derivado dos marcos
  Dado um conjunto de marcos com estados diferentes
  Quando o resumo é calculado
  Então cada contagem corresponde aos marcos recebidos

Cenário: dataset sem marco atual
  Dado um conjunto sem status active
  Quando o dataset é validado
  Então ele é aceito sem inventar um marco atual

Cenário: dataset inconsistente
  Dado um conjunto com mais de um marco active ou current divergente
  Quando o dataset é validado
  Então a inconsistência é retornada para impedir publicação inválida
*/
import { describe, expect, it } from 'vitest';
import { getRoadmapSummary, validateRoadmap, type Milestone } from './roadmapData';

const makeMilestone = (overrides: Partial<Milestone>): Milestone => ({
  period: 'Jan 2027',
  title: 'Marco de teste',
  summary: 'Resumo de teste.',
  gains: ['Ganho de teste'],
  status: 'planned',
  ...overrides,
});

describe('roadmapData', () => {
  it('calcula o resumo a partir dos estados dos marcos', () => {
    const items = [
      makeMilestone({ period: 'Jan 2027', status: 'done' }),
      makeMilestone({ period: 'Fev 2027', status: 'done' }),
      makeMilestone({ period: 'Mar 2027', status: 'active', current: true }),
      makeMilestone({ period: 'Abr 2027', status: 'planned' }),
    ];

    expect(getRoadmapSummary(items)).toEqual({ done: 2, active: 1, planned: 1 });
  });

  it('aceita um dataset vazio e um dataset sem marco atual', () => {
    expect(validateRoadmap([])).toEqual([]);
    expect(validateRoadmap([makeMilestone({ current: false })])).toEqual([]);
  });

  it('retorna erros para estados active/current incoerentes', () => {
    const items = [
      makeMilestone({ period: 'Jan 2027', status: 'active', current: true }),
      makeMilestone({ period: 'Fev 2027', status: 'active' }),
    ];

    expect(validateRoadmap(items)).toEqual([
      'O roadmap pode ter no máximo um marco em andamento.',
      'O marco atual deve ser o único marco em andamento.',
    ]);
  });

  it('rejeita marcos duplicados e um current que não seja active', () => {
    const items = [
      makeMilestone({ period: 'Jan 2027', title: 'Repetido', current: true }),
      makeMilestone({ period: 'Jan 2027', title: 'Repetido' }),
    ];

    expect(validateRoadmap(items)).toEqual([
      'O marco atual deve ser o único marco em andamento.',
      'Os marcos do roadmap não podem ser duplicados.',
    ]);
  });
});
