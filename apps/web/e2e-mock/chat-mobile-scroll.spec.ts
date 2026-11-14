import { expect, test, type Page } from '@playwright/test';
/*
Funcionalidade: manter referência visual no chat mobile
Cenário: envio e recebimento no fim acompanham a conversa sem rolar a página
Cenário: leitura antiga preserva posição e permite voltar às mensagens recentes
Cenário: teclado virtual mantém compositor acessível e controles ficam em coluna
*/
async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('token','isolated-chat-qa');
    localStorage.setItem('refreshToken','isolated-chat-qa-refresh');
    localStorage.setItem('user',JSON.stringify({name:'QA',role:'admin',tenantId:'isolated'}));
    sessionStorage.setItem('ady-chat-current','c1');
  });
  await page.route('http://127.0.0.1:3100/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Conversa longa'}]});
    if (path === '/api/chat/conversations/c1') return route.fulfill({json:{messages:Array.from({length:40},(_,i)=>({id:`m${i}`,role:i%2?'assistant':'user',content:`Mensagem ${i}: contexto preservado na conversa.`})),approvals:[]}});
    if (path.endsWith('/plans')) return route.fulfill({json:{plans:[]}});
    if (path === '/api/notifications') return route.fulfill({json:{data:{items:[],unreadCount:1,nextCursor:null}}});
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'isolated endpoint'}});
  });
  await page.goto('/chat');
  await page.getByRole('button',{name:'Somente essenciais'}).click();
  await expect(page.getByText('Mensagem 39:',{exact:false})).toBeVisible();
}
const bottom = (page:Page) => page.locator('.ady-chat-messages').evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop));
for (const width of [375,390,1280,1440]) {
  test(`envio e resposta mantêm fim e página estáveis — ${width}`,async ({page},info)=>{
    await page.setViewportSize({width,height:812});
    await setup(page);
    let release!:()=>void;
    const pending = new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/api/chat/conversations/c1/messages',async route=>{
      await pending;
      await route.fulfill({contentType:'text/event-stream',body:'event: done\ndata: {"message":{"content":"Resposta relevante recebida"}}\n\n'});
    });
    await page.getByRole('textbox',{name:'Mensagem',exact:true}).fill('Mensagem enviada agora');
    const y=await page.evaluate(()=>window.scrollY);
    await page.getByRole('button',{name:'Enviar mensagem'}).click();
    await expect(page.getByText('Ady está respondendo…')).toBeInViewport();
    await expect(page.locator('.ady-chat-message').getByText('Mensagem enviada agora',{exact:true})).toBeInViewport();
    expect(await page.evaluate(()=>window.scrollY)).toBe(y);
    release();
    await expect(page.getByText('Resposta relevante recebida')).toBeInViewport();
    await expect.poll(()=>bottom(page)).toBeLessThan(2);
    expect(await page.evaluate(()=>window.scrollY)).toBe(y);
    await page.screenshot({path:info.outputPath(`chat-${width}.png`)});
  });
}
test('coluna mobile reserva espaço e mantém alvos de 44px',async ({page},info)=>{
  await page.setViewportSize({width:375,height:812}); await setup(page);
  const a=(await page.getByRole('button',{name:/Ativar modo/}).boundingBox())!;
  const bell=page.getByRole('button',{name:'Notificações, 1 não lida',exact:true});
  const b=(await bell.boundingBox())!;
  expect(a.x).toBe(b.x); expect(b.y).toBeGreaterThanOrEqual(a.y+a.height+8);
  expect(a.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
  const header=(await page.locator('.ady-chat-header').boundingBox())!;
  expect(header.y+header.height).toBeGreaterThanOrEqual(b.y+b.height);
  await bell.click(); await expect(page.getByRole('dialog',{name:'Lista de notificações'})).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.screenshot({path:info.outputPath('mobile-controls.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
test('teclado visual mantém compositor acessível e preserva leitura antiga',async ({page})=>{
  await page.setViewportSize({width:390,height:844}); await setup(page);
  await page.evaluate(()=>{
    Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>480});
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(async()=>{const b=(await page.locator('.ady-chat-composer-area').boundingBox())!;return b.y+b.height;}).toBeLessThanOrEqual(480);
  await expect.poll(()=>bottom(page)).toBeLessThan(2);
  const messages=page.locator('.ady-chat-messages');
  await messages.evaluate(el=>{el.scrollTop=160;});
  await expect(page.getByRole('button',{name:'Mensagens recentes',exact:true})).toBeVisible();
  const before=await messages.evaluate(el=>el.scrollTop);
  await page.evaluate(()=>{
    Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>844});
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(()=>messages.evaluate(el=>el.scrollTop)).toBe(before);
  await page.route('**/api/chat/conversations/c1/messages',route=>route.fulfill({contentType:'text/event-stream',body:'event: done\ndata: {"message":{"content":"Nova resposta durante leitura"}}\n\n'}));
  await page.getByRole('textbox',{name:'Mensagem',exact:true}).fill('Continuar');
  await page.getByRole('button',{name:'Enviar mensagem'}).click();
  await expect(page.getByText('Nova resposta durante leitura')).toHaveCount(1);
  expect(await messages.evaluate(el=>el.scrollTop)).toBe(before);
  await page.getByRole('button',{name:'Mensagens recentes',exact:true}).click();
  await expect.poll(()=>bottom(page)).toBeLessThan(2);
});
