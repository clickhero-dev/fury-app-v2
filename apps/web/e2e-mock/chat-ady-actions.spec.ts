import { expect, test } from '@playwright/test';

const actions = [
  ['Não sei o que postar', 'próximo post'],
  ['Organizar minha semana', 'semana'],
  ['Usar uma foto minha', 'foto'],
];
const specificActions = [
  ['Criar post para o Instagram', 'post para o Instagram'],
  ['Agendar posts da semana', 'agendar os posts da semana'],
  ['Criar Reels para o Instagram', 'Reels para o Instagram'],
  ['Criar vídeo para o negócio', 'vídeo para meu negócio'],
  ['Aumentar seguidores no Instagram', 'aumentar seguidores'],
  ['Atrair clientes pelo WhatsApp', 'clientes pelo WhatsApp'],
];
// Funcionalidade: iniciar ações úteis com segurança em telas pequenas e desktop.
// Dado o chat isolado, nada é enviado até o clique. O clique prepara o entregável
// sem briefing nem autorização de publicação, mídia paga ou geração com custo.
for (const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]) {
  test(`encaixe e pedidos diretos ${viewport.width}x${viewport.height}`, async ({page}) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const requests: string[] = [];
    const sends: string[] = [];
    await page.addInitScript(() => {
      localStorage.setItem('token','mock');
      localStorage.setItem('user',JSON.stringify({name:'QA',role:'admin',tenantId:'test'}));
    });
    await page.route('http://127.0.0.1:3100/**', async route => {
      const req = route.request(); const path = new URL(req.url()).pathname;
      if (req.method() !== 'GET') requests.push(path);
      if (path === '/api/chat/conversations') return route.fulfill({json:req.method()==='GET' ? [] : {id:'c1',title:'Nova conversa'}});
      if (path.endsWith('/messages')) {
        sends.push(req.postDataJSON().content);
        return route.fulfill({contentType:'text/event-stream',body:'event: done\ndata: {"message":{"content":"Conecte sua conta nas integrações para continuar. Nenhuma ação executada."}}\n\n'});
      }
      if (path.endsWith('/plans')) return route.fulfill({json:{plans:[]}});
      if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
      return route.fulfill({status:404,json:{error:'isolated'}});
    });
    await page.goto('/chat');
    await page.getByRole('button',{name:'Somente essenciais'}).click();
    const fit = async () => {
      const dims = await page.locator('.ady-chat').evaluate(el => {
        const r=el.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth};
      });
      expect(dims.left).toBeGreaterThanOrEqual(0); expect(dims.top).toBeGreaterThanOrEqual(0);
      expect(dims.right).toBeLessThanOrEqual(dims.width); expect(dims.bottom).toBeLessThanOrEqual(dims.height);
      expect(dims.scroll).toBeLessThanOrEqual(dims.width);
      await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toBeInViewport();
    };
    await expect(page.getByRole('heading',{name:'Assistente do Ady'})).toBeVisible();
    await fit();
    await expect(page.getByRole('group',{name:'Ações específicas'}).getByRole('button')).toHaveCount(6);
    for (const [label,prompt] of [...actions,...specificActions]) {
      await expect(page.getByRole('group',{name:'Ações para começar'}).getByRole('button')).toHaveCount(3);
      expect(requests).toEqual([]);
      await page.getByRole('button',{name:label,exact:true}).click();
      await expect(page.getByText('Conecte sua conta nas integrações para continuar. Nenhuma ação executada.',{exact:true})).toBeVisible();
      await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toHaveValue('');
      await expect(page.getByRole('button',{name:'Anexar arquivos'})).toBeEnabled();
      await expect(page.getByRole('button',{name:'Continuar com Ady'})).toHaveCount(0);
      expect(sends.at(-1)).toContain(prompt);
      expect(sends.at(-1)).toContain('confirmação explícita');
      expect(sends.at(-1)).toContain('não autoriza publicar, agendar, investir em mídia paga');
      expect(requests).toEqual(['/api/chat/conversations','/api/chat/conversations/c1/messages']);
      await fit();
      // Start each action from an independent empty conversation.
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await expect(page.getByRole('button',{name:'Não sei o que postar',exact:true})).toBeVisible();
      requests.length=0;
    }
  });
}

// Cenário: teclado reduz e desloca a área visível, inclusive em paisagem.
for (const width of [390,844]) test(`acompanha visualViewport com teclado ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  await page.addInitScript(() => {
    localStorage.setItem('token','mock');
    localStorage.setItem('user',JSON.stringify({role:'admin',tenantId:'test'}));
    const viewport = new EventTarget();
    Object.assign(viewport,{width:300,height:320,offsetTop:30,offsetLeft:10,scale:1});
    Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
  });
  await page.route('http://127.0.0.1:3100/**',route => route.fulfill({json:[]}));
  await page.goto('/chat');
  await page.getByRole('button',{name:'Somente essenciais'}).click();
  const panel = page.locator('.ady-chat');
  await expect.poll(() => panel.evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(310);
  expect(await panel.evaluate(el => el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(10);
  expect(await panel.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(350);
  await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toBeInViewport();
});
