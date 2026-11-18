import { expect, test, type Page } from '@playwright/test';

// Funcionalidade: sugestões iniciam briefing sem autorizar operações externas.
async function isolate(page:Page, {profile = true, fail = false} = {}) {
  const sends:{path:string; content:string}[] = []; const writes:string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('token','mock');
    localStorage.setItem('user',JSON.stringify({role:'admin',tenantId:'test'}));
    sessionStorage.setItem('ady-chat-current','c1');
  });
  await page.route('http://127.0.0.1:3100/**',async route => {
    const req=route.request(); const path=new URL(req.url()).pathname;
    if (req.method() !== 'GET') writes.push(path);
    if (path === '/api/auth/me') return profile
      ? route.fulfill({json:{success:true,data:{tenantName:'Flores da Ana',businessContext:'Floricultura local',audienceDefaults:{city:'Recife'}}}})
      : route.fulfill({status:503,json:{error:'indisponível'}});
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Conversa atual'},{id:'c2',title:'Outra conversa'}]});
    if (/\/conversations\/c[12]$/.test(path)) return route.fulfill({json:{id:path.split('/').at(-1),messages:[],approvals:[],clarifications:[]}});
    if (path.endsWith('/messages')) {
      sends.push({path,content:req.postDataJSON().content});
      if (fail) return route.fulfill({status:503,json:{error:'indisponível'}});
      return route.fulfill({contentType:'text/event-stream',body:'event: done\ndata: {"message":{"id":"ady-next","content":"Qual duração você prefere para o Reels?"}}\n\n'});
    }
    if (path.endsWith('/plans')) return route.fulfill({json:{plans:[]}});
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'isolated'}});
  });
  await page.goto('/chat');
  await page.getByRole('button',{name:'Somente essenciais'}).click();
  await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toBeEnabled();
  return {sends,writes};
}
for (const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]) {
  test(`Dado contexto real Quando toca duas vezes Então envia uma escolha na mesma conversa ${viewport.width}`,async ({page},testInfo) => {
    await page.setViewportSize(viewport);
    const {sends,writes}=await isolate(page);
    await page.getByRole('button',{name:'Criar Reels para o Instagram',exact:true}).click();
    const group=page.getByRole('group',{name:'Qual é o tema e o objetivo do Reels?',exact:true});
    const option=group.getByRole('button',{name:'Apresentar Flores da Ana para atrair clientes em Recife',exact:true});
    await expect(option).toBeVisible();
    await expect(page.locator('.ady-chat-main').getByRole('textbox')).toHaveCount(1);
    await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toBeInViewport();
    expect(writes).toEqual([]);
    for (const button of await group.getByRole('button').all()) {
      await button.scrollIntoViewIfNeeded();
      const box=await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.screenshot({path:testInfo.outputPath(`suggestions-${viewport.width}.png`)});
    // Two synchronous activations exercise the submission latch before re-render.
    await option.evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
    await expect(page.getByText('Qual duração você prefere para o Reels?',{exact:true})).toBeVisible();
    expect(sends).toHaveLength(1); expect(sends[0].path).toBe('/api/chat/conversations/c1/messages');
    expect(sends[0].content).toContain('Floricultura local'); expect(sends[0].content).toContain('Esta solicitação não autoriza executar essas ações.');
    expect(writes).toEqual(['/api/chat/conversations/c1/messages']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
test('Dado resposta personalizada Quando envia pelo compositor Então preserva contexto e mostra próximo passo',async ({page}) => {
  await page.setViewportSize({width:390,height:844}); const {sends,writes}=await isolate(page);
  await page.getByRole('button',{name:'Criar Reels para o Instagram',exact:true}).click();
  await expect(page.getByRole('button',{name:/Apresentar Flores/})).toBeVisible();
  const input=page.getByRole('textbox',{name:'Mensagem',exact:true});
  await input.fill('Mostrar arranjos para casamentos'); await input.press('Enter');
  await expect(page.getByText('Qual duração você prefere para o Reels?',{exact:true})).toBeVisible();
  expect(sends).toHaveLength(1); expect(sends[0].content).toContain('Reels para o Instagram em formato vertical');
  expect(sends[0].content).toContain('Mostrar arranjos para casamentos'); expect(sends[0].content).toContain('Flores da Ana');
  await expect(input).toHaveValue(''); expect(writes).toEqual(['/api/chat/conversations/c1/messages']);
});
test('Dado perfil indisponível Quando usa teclado Então escolhe intenção sem contexto inventado',async ({page}) => {
  await page.setViewportSize({width:390,height:844}); const {sends}=await isolate(page,{profile:false});
  await page.getByRole('button',{name:'Criar Reels para o Instagram',exact:true}).click();
  await expect(page.getByText('Qual é o tema e o objetivo do Reels?',{exact:true})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Apresentar meu negócio para atrair clientes',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Qual duração você prefere para o Reels?',{exact:true})).toBeVisible();
  expect(sends).toHaveLength(1); expect(sends[0].content).not.toContain('Flores da Ana');
});
test('Dado cancelamento Quando envia texto livre Então não anexa a ação cancelada',async ({page}) => {
  await page.setViewportSize({width:390,height:844}); const {sends}=await isolate(page);
  const input=page.getByRole('textbox',{name:'Mensagem',exact:true}); await input.fill('Minha dúvida personalizada');
  await page.getByRole('button',{name:'Criar Reels para o Instagram',exact:true}).click();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(input).toHaveValue('Minha dúvida personalizada'); await input.press('Enter');
  await expect.poll(() => sends.length).toBe(1); expect(sends[0].content).toBe('Minha dúvida personalizada');
});
test('Dado troca de conversa Quando responde Então não transfere ação da conversa anterior',async ({page}) => {
  await page.setViewportSize({width:390,height:844}); const {sends}=await isolate(page);
  await page.getByRole('button',{name:'Criar Reels para o Instagram',exact:true}).click();
  await page.getByRole('button',{name:'Mostrar conversas',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Outra conversa',exact:true}).click();
  const input=page.getByRole('textbox',{name:'Mensagem',exact:true}); await input.fill('Outra dúvida'); await input.press('Enter');
  await expect.poll(() => sends.length).toBe(1);
  expect(sends[0]).toEqual({path:'/api/chat/conversations/c2/messages',content:'Outra dúvida'});
});
