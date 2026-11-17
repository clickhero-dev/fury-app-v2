import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../lib/api';
import { useQuickActionContext } from './useQuickActionContext';
vi.mock('../../lib/api', () => ({default:{get:vi.fn()}}));
beforeEach(() => vi.clearAllMocks());
describe('Funcionalidade: consultar contexto sem efeitos externos', () => {
  it('Dado nenhum atalho aberto Então não consulta; Quando abre Então usa perfil autenticado e normaliza', async () => {
    vi.mocked(api.get).mockResolvedValue({data:{data:{tenantName:'Flores',audienceDefaults:{city:'Recife'}}}});
    const {result,rerender} = renderHook(({enabled}) => useQuickActionContext(enabled),{initialProps:{enabled:false}});
    expect(api.get).not.toHaveBeenCalled(); rerender({enabled:true});
    await waitFor(() => expect(result.current).toEqual({tenantName:'Flores',city:'Recife'}));
    expect(api.get).toHaveBeenCalledTimes(1); expect(api.get).toHaveBeenCalledWith('/auth/me');
  });
  it.each([401,403,404,503])('Dado erro %s Então usa fallback sem bloquear o compositor nem repetir', async status => {
    vi.mocked(api.get).mockRejectedValue({response:{status}});
    const {result} = renderHook(() => useQuickActionContext(true));
    await act(async () => {});
    expect(result.current).toEqual({}); expect(api.get).toHaveBeenCalledTimes(1);
  });
  it('Dado requisição pendente Quando sai do fluxo Então ignora resposta tardia', async () => {
    let resolve!: (value:unknown) => void;
    vi.mocked(api.get).mockImplementation(() => new Promise(r => {resolve=r;}));
    const {result,rerender} = renderHook(({enabled}) => useQuickActionContext(enabled),{initialProps:{enabled:true}});
    rerender({enabled:false});
    await act(async () => resolve({data:{data:{tenantName:'Não aplicar'}}}));
    expect(result.current).toEqual({});
  });
});
