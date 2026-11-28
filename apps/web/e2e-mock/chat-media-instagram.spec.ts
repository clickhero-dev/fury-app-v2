import { expect, test } from '@playwright/test';

for (const mobile of [false, true]) {
  test(`visualiza mídia gerada e confirma publicação (${mobile ? 'mobile' : 'desktop'})`, async ({page}) => {
    if (mobile) await page.setViewportSize({width:390,height:844});
    await page.addInitScript(() => {
      localStorage.setItem('token','isolated-session');
      localStorage.setItem('refreshToken','isolated-refresh');
      localStorage.setItem('user',JSON.stringify({name:'QA',email:'qa@example.invalid',role:'admin',tenantId:'isolated'}));
    });
    let publications = 0;
    await page.route('https://media.example.test/**', route => route.fulfill({
      contentType:'image/png',
      body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/WZkAAAAASUVORK5CYII=','base64'),
    }));
    await page.route('http://127.0.0.1:3100/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Mídias'}]});
      if (path === '/api/chat/conversations/c1') return route.fulfill({json:{messages:[],approvals:[{id:'11111111-1111-4111-8111-111111111111',action:'Criar imagem',status:'completed',parameters:{},result:{imageUrl:'https://media.example.test/a.png'}}]}});
      if (path === '/api/chat/conversations/c1/plans') return route.fulfill({json:{plans:[]}});
      if (path === '/api/meta/connections') return route.fulfill({json:{data:[{selectedInstagramUserId:'ig',selectedInstagramUsername:'loja'}]}});
      if (path === '/api/meta/scopes') return route.fulfill({json:{data:{scopes:['instagram_content_publish']}}});
      if (path === '/api/planner/chat-media/11111111-1111-4111-8111-111111111111/publish') {
        publications++;
        return route.fulfill({json:{data:{status:'published'}}});
      }
      if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
      return route.fulfill({status:404,json:{error:'not found'}});
    });
    await page.goto('/chat');
    await page.getByRole('button',{name:'Somente essenciais'}).click();
    if (mobile) await page.getByRole('button',{name:'Mostrar conversas'}).click();
    await page.getByRole('button',{name:'Mídias'}).click();
    await page.getByRole('textbox',{name:'Mensagem'}).fill('Rascunho preservado');
    await page.getByRole('button',{name:'Abrir Imagem gerada'}).click();
    await expect(page.getByRole('dialog',{name:'Visualização de Imagem gerada'})).toBeVisible();
    await page.getByRole('button',{name:'Fechar visualização'}).click();
    await expect(page.getByRole('textbox',{name:'Mensagem'})).toHaveValue('Rascunho preservado');
    await page.getByRole('button',{name:'Compartilhar no Instagram'}).click();
    await expect(page.getByRole('dialog',{name:'Revisar publicação'})).toContainText('@loja');
    expect(publications).toBe(0);
    await page.getByRole('button',{name:'Confirmar publicação'}).click();
    await expect(page.getByText('Publicado com sucesso no Instagram.')).toBeVisible();
    expect(publications).toBe(1);
  });
}
