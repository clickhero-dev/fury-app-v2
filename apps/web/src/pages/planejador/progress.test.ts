import { describe, it, expect } from 'vitest';
import { stageLabel, overallProgress } from './progress';
import type { AgentStep } from './types';

describe('stageLabel', () => {
  it('mapeia cada agente para uma fase amigável em português', () => {
    expect(stageLabel('Context Agent')).toBe('Coletando dados da sua empresa…');
    expect(stageLabel('Research Agent')).toBe('Pesquisando tendências e datas…');
    expect(stageLabel('Analytics Agent')).toBe('Analisando suas métricas…');
    expect(stageLabel('Strategy Agent')).toBe('Definindo estratégia de conteúdo…');
    expect(stageLabel('Planner Agent')).toBe('Planejando os posts do mês…');
    expect(stageLabel('Copywriter Agent')).toBe('Escrevendo os conteúdos…');
    expect(stageLabel('Creative Agent')).toBe('Criando sugestões de artes…');
    expect(stageLabel('Quality Agent')).toBe('Revisando a qualidade…');
    expect(stageLabel('Scheduler Agent')).toBe('Agendando no calendário…');
    expect(stageLabel('Branding Agent')).toBe('Validando com a marca…');
  });

  it('mapeia a etapa final de conclusão', () => {
    expect(stageLabel('Pipeline concluído')).toBe('Planejamento concluído');
  });

  it('usa label genérico para agente desconhecido', () => {
    expect(stageLabel('Unknown Agent')).toBe('Preparando seu conteúdo…');
  });
});

describe('overallProgress', () => {
  const step = (name: string, status: AgentStep['status'], pct: number): AgentStep => ({ name, status, pct });

  it('retorna 0 quando não há etapas', () => {
    expect(overallProgress([])).toBe(0);
  });

  it('retorna o maior percentual entre as etapas', () => {
    const steps = [
      step('Context Agent', 'completed', 15),
      step('Research Agent', 'completed', 25),
      step('Analytics Agent', 'running', 30),
      step('Strategy Agent', 'pending', 40),
    ];
    expect(overallProgress(steps)).toBe(40);
  });

  it('ignora etapas pendentes com pct zero', () => {
    const steps = [step('Context Agent', 'completed', 15), step('Research Agent', 'pending', 0)];
    expect(overallProgress(steps)).toBe(15);
  });

  it('limita em 100 para valores acima', () => {
    const steps = [step('Context Agent', 'completed', 150)];
    expect(overallProgress(steps)).toBe(100);
  });

  it('limita em 0 para valores negativos', () => {
    const steps = [step('Context Agent', 'pending', -5)];
    expect(overallProgress(steps)).toBe(0);
  });
});
