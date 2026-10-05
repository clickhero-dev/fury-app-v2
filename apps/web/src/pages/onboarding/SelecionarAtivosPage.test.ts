/*
Funcionalidade: confirmação dos ativos Meta no onboarding
  Cenário: resposta confirma os mesmos ativos enviados
    Dado uma seleção válida
    Quando a API devolve a seleção persistida
    Então a navegação pode continuar
  Cenário: resposta sem a conta de anúncio
    Dado uma seleção válida
    Quando a API não confirma a conta
    Então a navegação é bloqueada
*/
import { describe, expect, it } from 'vitest';
import { isConfirmedMetaSelection } from './SelecionarAtivosPage';

const expected = { businessIds: ['bm_1'], pageIds: ['page_1'], adAccountIds: ['act_1'], instagramUserId: 'ig_1' };

describe('isConfirmedMetaSelection', () => {
  it('confirma quando a API persistiu todos os ativos selecionados', () => {
    expect(isConfirmedMetaSelection({ ...expected, selectedAdAccountId: 'act_1' }, expected)).toBe(true);
  });

  it('bloqueia quando a API não confirma a conta de anúncio', () => {
    expect(isConfirmedMetaSelection({ ...expected, adAccountIds: [] }, expected)).toBe(false);
  });
});
