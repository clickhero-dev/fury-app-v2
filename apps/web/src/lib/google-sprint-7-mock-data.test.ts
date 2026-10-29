/*
# Language: pt-BR

Funcionalidade: consultar dados demonstrativos da Sprint 7

  Cenário: selecionar métricas do Google ou da Meta
    Dado que a pessoa alterna o canal no dashboard
    Quando solicita as métricas do canal escolhido
    Então recebe rótulo, valores e moeda correspondentes sem consultar a API

  Cenário: listar campanhas Google de demonstração
    Dado que a pessoa abre a lista de campanhas Google
    Quando os dados simulados são carregados
    Então vê campanhas ativas, em revisão e pausadas

  Cenário: carregar avaliações com notas privadas separadas das respostas públicas
    Dado que a pessoa abre as avaliações do Perfil da Empresa
    Quando os exemplos de avaliação são carregados
    Então cada nota interna é independente da resposta pública
*/
import { describe, expect, it } from 'vitest';
import {
  getSprint7Campaigns,
  getSprint7DashboardMetrics,
  sprint7MockReviews,
} from './google-sprint-7-mock-data';

describe('dados demonstrativos da Sprint 7', () => {
  it('retorna métricas diferentes para Google e Meta sem compartilhar objetos', () => {
    const google = getSprint7DashboardMetrics('google');
    const meta = getSprint7DashboardMetrics('meta');

    expect(google.providerLabel).toBe('Google');
    expect(meta.providerLabel).toBe('Meta');
    expect(google.impressions).not.toBe(meta.impressions);
    expect(google).not.toBe(meta);
  });

  it('oferece campanhas mock dos estados previstos para a lista', () => {
    const campaigns = getSprint7Campaigns('google');

    expect(campaigns.map((campaign) => campaign.status)).toEqual(['active', 'review', 'paused']);
    expect(campaigns.every((campaign) => campaign.provider === 'google')).toBe(true);
  });

  it('mantém notas privadas distintas das respostas públicas', () => {
    expect(sprint7MockReviews.some((review) => review.internalNote)).toBe(true);
    expect(sprint7MockReviews.every((review) => !review.internalNote || !review.publicReply || review.internalNote !== review.publicReply)).toBe(true);
  });
});
