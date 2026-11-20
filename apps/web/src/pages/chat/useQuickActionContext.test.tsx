import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../lib/api';
import { useQuickActionContext } from './useQuickActionContext';
vi.mock('../../lib/api', () => ({default:{get:vi.fn()}}));
beforeEach(() => {vi.resetAllMocks();localStorage.clear();});
describe('Funcionalidade: consultar contexto sem efeitos externos', () => {
  it('troca de tenant esconde contexto anterior imediatamente e rejeita resposta atrasada',async()=>{
    localStorage.setItem('user',JSON.stringify({tenantId:'tenant-a',id:'user-a'}));
    let resolveA!:(data:unknown)=>void, resolveB!:(data:unknown)=>void;
    vi.mocked(api.get).mockImplementationOnce(()=>new Promise(resolve=>{resolveA=resolve;}))
      .mockImplementationOnce(()=>new Promise(resolve=>{resolveB=resolve;}));
    const {result,rerender}=renderHook(()=>useQuickActionContext(true));
    localStorage.setItem('user',JSON.stringify({tenantId:'tenant-b',id:'user-b'}));
    rerender();
    expect(result.current).toEqual({});
    await act(async()=>resolveB({data:{data:{tenantName:'Marca B',audienceDefaults:{city:'Salvador'}}}}));
    expect(result.current).toEqual({tenantName:'Marca B',city:'Salvador'});
    await act(async()=>resolveA({data:{data:{tenantName:'Marca A',audienceDefaults:{city:'Recife'}}}}));
    expect(result.current).toEqual({tenantName:'Marca B',city:'Salvador'});
    expect(api.get).toHaveBeenCalledTimes(2);
  });
  it('não mantém cidade já carregada quando muda de tenant',async()=>{
    localStorage.setItem('user',JSON.stringify({tenantId:'tenant-a'}));
    vi.mocked(api.get).mockResolvedValueOnce({data:{data:{tenantName:'Marca A',audienceDefaults:{city:'Recife'}}}})
      .mockResolvedValueOnce({data:{data:{tenantName:'Marca B',audienceDefaults:{city:'Salvador'}}}});
    const {result,rerender}=renderHook(()=>useQuickActionContext(true));
    await waitFor(()=>expect(result.current.city).toBe('Recife'));
    localStorage.setItem('user',JSON.stringify({tenantId:'tenant-b'}));
    rerender();
    expect(result.current.city).not.toBe('Recife');
    await waitFor(()=>expect(result.current.city).toBe('Salvador'));
  });
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
