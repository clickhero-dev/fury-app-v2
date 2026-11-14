import { describe, it, expect, vi } from 'vitest';
import { ChatReadCapabilities } from '../services/chat/chat-read-capabilities.js';

describe('consultas seguras da Ady', () => {
  const make = () => {
    const deps = {
      subscription: vi.fn(async (_tenant: string) => ({ creativesRemaining: 2, creativesLimit: 5 } as {creativesRemaining: number | null; creativesLimit: number | null} | null)),
      videos: vi.fn(async (_tenant: string) => ({ videosLimit: 3 as number | null, videosRemaining: 0 as number | null })),
      connection: vi.fn(async (_tenant: string) => ({ accessToken: 'secret', tokenExpiresAt: null as Date | null, selectedAdAccountId: 'act_1', selectedPageIds: ['p'], selectedInstagramUserId: 'ig' } as any)),
      decrypt: vi.fn(() => 'token'),
      permissions: vi.fn(async () => ['ads_management', 'ads_read', 'pages_show_list', 'pages_manage_ads']),
      account: vi.fn(async () => true), page: vi.fn(async (_token: string, _page: string) => ({tasks:['ADVERTISE']})), instagram: vi.fn(async () => undefined), link: vi.fn(async (_page: string, _instagram: string, _token: string) => true),
    };
    return { deps, service: new ChatReadCapabilities(deps) };
  };
  it('lê somente cotas do tenant e preserva zero e limite desconhecido', async () => {
    const {deps, service} = make();
    deps.videos.mockResolvedValueOnce({videosLimit:null,videosRemaining:null});
    expect(await service.quota('tenant-a')).toEqual({subscription:'active',images:{limit:5,remaining:2},videos:{limit:null,remaining:null}});
    expect(deps.subscription).toHaveBeenCalledWith('tenant-a', true); expect(deps.videos).toHaveBeenCalledWith('tenant-a');
  });
  it('sem assinatura não apresenta limites como ilimitados', async () => {
    const {deps,service}=make(); deps.subscription.mockResolvedValueOnce(null);
    expect(await service.quota('tenant-a')).toEqual({subscription:'missing',images:null,videos:null}); expect(deps.videos).not.toHaveBeenCalled();
  });
  it('diagnóstico usa tenant autenticado e nunca garante aptidão', async () => {
    const {deps,service}=make(); const result=await service.meta('tenant-a');
    expect(deps.connection).toHaveBeenCalledWith('tenant-a'); expect(result.status).toBe('partial'); expect(result.checks.account).toBe('confirmed'); expect(result.checks.pageInstagramLink).toBe('confirmed');
    expect(JSON.stringify(result)).not.toContain('secret'); expect(JSON.stringify(result)).not.toContain('token');
  });
  it('não tenta chamadas para conexão ausente ou token expirado', async () => {
    const {deps,service}=make(); deps.connection.mockResolvedValueOnce(null); expect((await service.meta('a')).status).toBe('missing');
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:new Date(0)}); expect((await service.meta('b')).status).toBe('expired'); expect(deps.permissions).not.toHaveBeenCalled();
  });
  it('detecta token rejeitado pela Meta mesmo sem expiração local', async () => {
    const {deps,service}=make(); deps.permissions.mockRejectedValueOnce(Object.assign(new Error('segredo'), {code:'META_TOKEN_EXPIRED'}));
    const result = await service.meta('a'); expect(result.status).toBe('expired'); expect(JSON.stringify(result)).not.toContain('segredo');
  });
  it('distinguishes inactive ad accounts and exposes only the explicitly assessed permissions', async () => {
    const {deps,service}=make(); deps.account.mockResolvedValueOnce(false); const r=await service.meta('a');
    expect(r.checks.account).toBe('inactive');
    expect(r.checks.adsAndPagesPermissions).toBe('confirmed');
    expect(r.checks).not.toHaveProperty('permissions');
    expect(r.permissionScopes).toEqual(['ads_management','ads_read','pages_show_list','pages_manage_ads']);
  });
  it('distinguishes no page selection, page not returned by Meta and missing ADVERTISE task', async () => {
    const {deps,service}=make();
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:null,selectedPageIds:[]});
    expect((await service.meta('a')).checks.page).toBe('missing');
    deps.page.mockResolvedValueOnce(null as never);
    expect((await service.meta('a')).checks.page).toBe('not_returned');
    deps.page.mockResolvedValueOnce({tasks:[]});
    expect((await service.meta('a')).checks.page).toBe('missing_advertise');
  });
  it('isola a assinatura de cada tenant e não converte falha em ilimitado', async () => {
    const {deps,service}=make(); deps.subscription.mockImplementation(async t => t === 'tenant-a' ? {creativesLimit:5,creativesRemaining:0} : null);
    expect((await service.quota('tenant-a')).images?.remaining).toBe(0); expect((await service.quota('tenant-b')).images).toBeNull();
    deps.subscription.mockRejectedValueOnce(new Error('private')); await expect(service.quota('tenant-a')).rejects.toThrow();
  });
  it('diagnostica a página selecionada vinculada ao Instagram, não a primeira página', async () => {
    const {deps, service} = make();
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:null,selectedPageIds:['p1','p2'],selectedInstagramUserId:'ig'});
    deps.link.mockImplementation(async page => page === 'p2');
    deps.page.mockImplementation(async (_token, page) => ({tasks: page === 'p2' ? ['ADVERTISE'] : []}));
    const result = await service.meta('a');
    expect(result.checks.pageInstagramLink).toBe('confirmed');
    expect(result.checks.page).toBe('confirmed');
    expect(deps.link.mock.calls.map(call => call[0])).toEqual(['p1','p2']);
    expect(deps.page).toHaveBeenCalledWith('token','p2');
    expect(deps.page).not.toHaveBeenCalledWith('token','p1');
  });
  it('não escolhe uma página arbitrária quando nenhum vínculo é encontrado', async () => {
    const {deps, service} = make();
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:null,selectedPageIds:['p1','p2'],selectedInstagramUserId:'ig'});
    deps.link.mockResolvedValue(false);
    const result = await service.meta('a');
    expect(result.checks.pageInstagramLink).toBe('missing');
    expect(result.checks.page).toBe('unknown');
    expect(deps.page).not.toHaveBeenCalled();
  });
  it('preserva erro parcial em vez de declarar vínculo ausente', async () => {
    const {deps, service} = make();
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:null,selectedPageIds:['p1','p2'],selectedInstagramUserId:'ig'});
    deps.link.mockRejectedValueOnce(new Error('private')).mockResolvedValueOnce(false);
    const result = await service.meta('a');
    expect(result.checks.pageInstagramLink).toBe('error');
    expect(result.checks.page).toBe('unknown');
    expect(result.checks.instagram).toBe('confirmed');
    expect(JSON.stringify(result)).not.toContain('private');
    expect(deps.page).not.toHaveBeenCalled();
  });
  it('continua após falha e usa somente a página vinculada para verificar acesso', async () => {
    const {deps, service} = make();
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:null,selectedPageIds:['p1','p2'],selectedInstagramUserId:'ig'});
    deps.link.mockRejectedValueOnce(new Error('private')).mockResolvedValueOnce(true);
    deps.page.mockResolvedValueOnce({tasks:[]});
    const result = await service.meta('a');
    expect(result.checks.pageInstagramLink).toBe('confirmed');
    expect(result.checks.page).toBe('missing_advertise');
    expect(deps.page).toHaveBeenCalledExactlyOnceWith('token','p2');
  });
  it('reporta erro de acesso à página vinculada sem perder o vínculo confirmado', async () => {
    const {deps, service} = make();
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:null,selectedPageIds:['p1','p2'],selectedInstagramUserId:'ig'});
    deps.link.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    deps.page.mockRejectedValueOnce(new Error('private'));
    const result = await service.meta('a');
    expect(result.checks.pageInstagramLink).toBe('confirmed');
    expect(result.checks.page).toBe('error');
    expect(JSON.stringify(result)).not.toContain('private');
    expect(deps.page).toHaveBeenCalledExactlyOnceWith('token','p2');
  });
  it('preserva expiração de token ao pesquisar vínculos', async () => {
    const {deps, service} = make();
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:null,selectedPageIds:['p1','p2'],selectedInstagramUserId:'ig'});
    deps.link.mockRejectedValueOnce(Object.assign(new Error('private'), {code:'META_TOKEN_EXPIRED'})).mockResolvedValueOnce(false);
    const result = await service.meta('a');
    expect(result.status).toBe('expired');
    expect(result.checks.pageInstagramLink).toBe('error');
    expect(result.checks.page).toBe('unknown');
  });
  it('sem Instagram selecionado, só verifica acesso se houver uma única página', async () => {
    const {deps, service} = make();
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:null,selectedPageIds:['p1','p2']});
    const result = await service.meta('a');
    expect(result.checks.instagram).toBe('missing');
    expect(result.checks.page).toBe('unknown');
    expect(deps.link).not.toHaveBeenCalled();
    expect(deps.page).not.toHaveBeenCalled();
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:null,selectedPageIds:['p1']});
    expect((await service.meta('a')).checks.page).toBe('confirmed');
    expect(deps.page).toHaveBeenCalledExactlyOnceWith('token','p1');
  });
  it('respeita a ordem selecionada e ignora IDs inválidos e duplicados', async () => {
    const {deps, service} = make();
    deps.connection.mockResolvedValueOnce({accessToken:'secret',tokenExpiresAt:null,selectedPageIds:[null,'','  ','p1','p1','p2','p3'],selectedInstagramUserId:'ig'});
    deps.link.mockImplementation(async page => page !== 'p1');
    const result = await service.meta('a');
    expect(result.checks.pageInstagramLink).toBe('confirmed');
    expect(deps.link.mock.calls.map(call => call[0])).toEqual(['p1','p2']);
    expect(deps.page).toHaveBeenCalledExactlyOnceWith('token','p2');
  });
  it('vínculo ausente ou consulta indisponível não é confirmado', async () => {
    const {deps,service}=make(); deps.link.mockResolvedValueOnce(false); expect((await service.meta('a')).checks.pageInstagramLink).toBe('missing');
    deps.link.mockRejectedValueOnce(new Error('timeout')); expect((await service.meta('a')).checks.pageInstagramLink).toBe('error');
  });
  it('erro parcial não vaza mensagem e conserva validações restantes', async () => {
    const {deps,service}=make(); deps.account.mockRejectedValueOnce(new Error('secret')); const r=await service.meta('a');
    expect(r.checks.account).toBe('error'); expect(r.checks.instagram).toBe('confirmed'); expect(JSON.stringify(r)).not.toContain('secret');
  });
});
