import { expect, test } from '@playwright/test';

test('mantém o erro terminal do provedor sem exibir queda de conexão', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-retry');
    localStorage.setItem('refreshToken', 'isolated-retry-refresh');
    localStorage.setItem('user', JSON.stringify({name:'QA',role:'admin',tenantId:'isolated',email:'qa@example.invalid'}));
  });
  await page.route('http://127.0.0.1:3100/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/rbac/blocked-views')) return route.fulfill({json:{data:{blocked:[]}}});
    if (path.endsWith('/plans')) return route.fulfill({json:{plans:[]}});
    if (path === '/api/chat/conversations' && request.method() === 'GET') return route.fulfill({json:[]});
    if (path === '/api/chat/conversations' && request.method() === 'POST') return route.fulfill({json:{id:'conv',title:'Nova conversa'}});
    if (path === '/api/chat/conversations/conv/messages') {
      return route.fulfill({contentType:'text/event-stream', body:'event: error\ndata: {"message":"Não foi possível gerar a resposta agora. Tente retomar."}\n\n'});
    }
    return route.fulfill({status:404, json:{error:'not found'}});
  });
  await page.goto('/chat');
  await page.getByRole('button', {name:'Somente essenciais'}).click();
  await page.getByRole('button', {name:/nova conversa/i}).click();
  await page.getByRole('textbox', {name:'Mensagem'}).fill('Preciso de ajuda');
  await page.getByRole('textbox', {name:'Mensagem'}).press('Enter');
  await expect(page.getByText('Não foi possível gerar a resposta agora. Tente retomar.')).toBeVisible();
  await expect(page.getByText(/A conexão foi interrompida/)).toHaveCount(0);
});

for (const width of [375,1280]) {
  test(`recupera sem reenviar e cancela próximas etapas antes de outra ideia — ${width}`,async({page})=>{
    await page.setViewportSize({width,height:812});
    await page.addInitScript(()=>{
      localStorage.setItem('token','isolated-recovery');
      localStorage.setItem('refreshToken','isolated-recovery-refresh');
      localStorage.setItem('user',JSON.stringify({name:'QA',role:'admin',tenantId:'isolated',email:'qa@example.invalid'}));
    });
    let reads=0;
    let cancelled=false;
    const posts:string[]=[];
    await page.route('http://127.0.0.1:3100/**',async route=>{
      const request=route.request(),path=new URL(request.url()).pathname;
      if(request.method()==='POST')posts.push(path);
      if(path.endsWith('/rbac/blocked-views'))return route.fulfill({json:{data:{blocked:[]}}});
      if(path.endsWith('/plans'))return route.fulfill({json:{plans:[]}});
      if(path==='/api/chat/conversations')return route.fulfill({json:[{id:'conv',title:'Recuperar ideia'}]});
      if(path==='/api/chat/conversations/conv'){
        reads++;
        return route.fulfill({json:{messages:[{id:'prompt',role:'user',content:'Ideia anterior preservada'}],approvals:[],response_runs:[{
          id:reads===1?'old-run':'new-run',user_message_id:'prompt',status:reads===1?'interrupted':'running',
          recovery:{status:cancelled?'cancelled':reads===1?'queued':'running',nextAttemptAt:null,attempts:1,maxAttempts:3,deadlineAt:'2099-01-01T00:00:00Z',policyVersion:'1'},
        }]}});
      }
      if(path==='/api/chat/conversations/conv/runs/new-run/cancel'){cancelled=true;return route.fulfill({json:{status:'cancelled'}});}
      if(path==='/api/chat/conversations/conv/messages')return route.fulfill({headers:{'content-type':'text/event-stream'},body:'event: done\ndata: {"message":{"id":"next","content":"Outra ideia preparada"}}\n\n'});
      return route.fulfill({status:404,json:{error:'isolated'}});
    });
    await page.goto('/chat');
    await page.getByRole('button',{name:'Somente essenciais'}).click();
    if(width<768)await page.getByRole('button',{name:'Mostrar conversas'}).click();
    await page.getByRole('button',{name:'Recuperar ideia',exact:true}).click();
    await expect(page.getByText(/Recuperando o andamento/)).toBeVisible();
    await expect(page.getByRole('button',{name:/Retomar resposta/})).toHaveCount(0);
    await expect(page.getByText('Ady está trabalhando.')).toBeVisible({timeout:10000});
    expect(posts).toEqual([]);
    await page.getByRole('button',{name:'Cancelar próximas etapas'}).click();
    await expect(page.getByText(/Próximas etapas canceladas/)).toBeVisible();
    await expect(page.getByText(/ação externa já iniciada pode continuar/)).toBeVisible();
    await page.getByRole('button',{name:'Ver outra ideia'}).click();
    await page.getByRole('group',{name:'Outra direção',exact:true}).getByRole('button',{name:'Não sei o que postar'}).click();
    await expect(page.getByText('Outra ideia preparada')).toBeVisible();
    await expect(page.getByText('Ideia anterior preservada')).toBeVisible();
    expect(posts).toEqual(['/api/chat/conversations/conv/runs/new-run/cancel','/api/chat/conversations/conv/messages']);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
}
