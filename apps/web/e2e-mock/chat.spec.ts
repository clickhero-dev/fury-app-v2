import { expect, test } from '@playwright/test';

/*
Funcionalidade: histórico com nomes úteis
Cenário: título automático e renomeação manual
Dado que o usuário inicia uma conversa
Quando recebe um título e salva outro nome
Então o nome escolhido permanece após recarregar.
Cenário: alerta de planos não desloca quem acompanha o fim da conversa
Dado uma conversa longa aberta e rolada até as mensagens recentes
Quando o carregamento dos planos falha
Então o alerta aparece e o fim da conversa continua visível
*/
test('mostra título automático e mantém renomeação após recarregar', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-session');
    localStorage.setItem('refreshToken', 'isolated-refresh');
    localStorage.setItem('user', JSON.stringify({name:'QA',email:'qa@example.invalid',role:'admin',tenantId:'isolated'}));
  });
  let title = '';
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/chat/conversations' && method === 'GET') return route.fulfill({json:title ? [{id:'c1',title}] : []});
    if (path === '/api/chat/conversations' && method === 'POST') { title = 'Nova conversa'; return route.fulfill({json:{id:'c1',title}}); }
    if (path === '/api/chat/conversations/c1/messages') { title = 'Campanha para cafeteria'; return route.fulfill({contentType:'text/event-stream',body:`event: done\ndata: {"message":{"content":"Vamos criar sua campanha."}}\n\nevent: title\ndata: {"id":"c1","title":"${title}"}\n\n`}); }
    if (path === '/api/chat/conversations/c1' && method === 'PATCH') { title = route.request().postDataJSON().title; return route.fulfill({json:{id:'c1',title}}); }
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({json:{plans:[]}});
    if (path === '/api/chat/conversations/c1') return route.fulfill({json:{id:'c1',title,messages:[{id:'m1',role:'assistant',content:'Vamos criar sua campanha.'}],approvals:[]}});
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat');
  await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Nova conversa',exact:true}).click();
  await page.getByRole('textbox',{name:'Mensagem'}).fill('Quero ideias para minha cafeteria');
  await page.getByRole('textbox',{name:'Mensagem'}).press('Enter');
  await expect(page.getByRole('button',{name:'Campanha para cafeteria'})).toBeVisible();
  await page.getByRole('button',{name:'Opções da conversa'}).click();
  await page.getByRole('menuitem',{name:'Renomear conversa'}).click();
  await page.getByLabel('Nome da conversa').fill('Ideias de verão');
  await page.getByRole('button',{name:'Salvar nome'}).click();
  await expect(page.getByRole('button',{name:'Ideias de verão'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'Ideias de verão'})).toBeVisible();
});

test('centraliza a conversa, alinha remetentes e mostra a mensagem mais recente', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-session');
    localStorage.setItem('refreshToken', 'isolated-refresh');
    localStorage.setItem('user', JSON.stringify({name:'QA',email:'qa@example.invalid',role:'admin',tenantId:'isolated'}));
  });
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Projeto'}]});
    if (path === '/api/chat/conversations/c1') return route.fulfill({json:{messages:Array.from({length:20},(_,i)=>({id:String(i),role:i%2?'assistant':'user',content:`Mensagem ${i}`})),approvals:[]}});
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({json:{plans:[]}});
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat');
  await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Projeto'}).click();
  const list = page.locator('.ady-chat-messages');
  await expect(page.getByText('Mensagem 19')).toBeVisible();
  await expect.poll(() => list.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThan(2);
  const positions = await list.evaluate(el => {
    const user = el.querySelector('[data-role="user"]')!.getBoundingClientRect();
    const assistant = el.querySelector('[data-role="assistant"]')!.getBoundingClientRect();
    return { userX:user.x, assistantX:assistant.x };
  });
  expect(positions.userX).toBeGreaterThan(positions.assistantX);
});

test('mantém as mensagens recentes visíveis quando o alerta de planos aparece', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-session');
    localStorage.setItem('refreshToken', 'isolated-refresh');
    localStorage.setItem('user', JSON.stringify({name:'QA',email:'qa@example.invalid',role:'admin',tenantId:'isolated'}));
  });
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Projeto'}]});
    if (path === '/api/chat/conversations/c1') return route.fulfill({json:{messages:Array.from({length:20},(_,i)=>({id:String(i),role:i%2?'assistant':'user',content:`Mensagem ${i}`})),approvals:[]}});
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({status:500,json:{error:'isolated failure'}});
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat');
  await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Projeto'}).click();
  const list = page.locator('.ady-chat-messages');
  await expect(page.getByText('Não foi possível carregar os planos. Tente atualizar novamente.')).toBeVisible();
  await expect.poll(() => list.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThan(2);
});

test('conversa por streaming e recupera estado após interrupção', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-session');
    localStorage.setItem('refreshToken', 'isolated-refresh');
    localStorage.setItem('user', JSON.stringify({ name: 'QA', email: 'qa@example.invalid', role: 'admin', tenantId: 'isolated' }));
  });
  let sent = 0;
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/chat/conversations' && method === 'GET') return route.fulfill({json: []});
    if (path === '/api/chat/conversations' && method === 'POST') return route.fulfill({json: {id:'c1',title:'Nova conversa'}});
    if (path === '/api/chat/conversations/c1/messages') { sent++; return route.fulfill({contentType:'text/event-stream', body:'event: token\ndata: {"content":"Resposta parcial"}\n\n'}); }
    if (path === '/api/chat/conversations/c1') return route.fulfill({json: {id:'c1',title:'Nova conversa',messages:[{id:'m1',role:'assistant',content:'Resposta recuperada'}],approvals:[]}});
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({json:{plans:[]}});
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat');
  await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Nova conversa'}).first().click();
  await page.getByRole('textbox',{name:'Mensagem'}).fill('Olá');
  await page.getByRole('button',{name:'Enviar mensagem'}).click();
  await expect(page.getByRole('alert').filter({hasText:'A conexão foi interrompida'})).toContainText('A conexão foi interrompida');
  await page.getByRole('button',{name:'Atualizar conversa'}).click();
  await expect(page.getByText('Resposta recuperada')).toBeVisible();
  expect(sent).toBe(1);
});

test('pede confirmação antes de executar uma proposta pendente', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-session');
    localStorage.setItem('refreshToken', 'isolated-refresh');
    localStorage.setItem('user', JSON.stringify({name:'QA',email:'qa@example.invalid',role:'admin',tenantId:'isolated'}));
  });
  let confirmations = 0;
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Campanha'}]});
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({json:{plans:[]}});
    if (path === '/api/chat/conversations/c1') return route.fulfill({json:{messages:[],approvals:[{id:'a1',action:'Pausar campanha',parameters:{nome:'Campanha de verão'},status:'pending'}]}});
    if (path === '/api/chat/approvals/a1/confirm') { confirmations++; return route.fulfill({json:{status:'completed',result:{imageUrl:'https://example.com/imagem.png'}}}); }
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat');
  await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Campanha',exact:true}).click();
  await expect(page.getByText('Confirme esta ação: Pausar campanha')).toBeVisible();
  await expect(page.getByText(/Campanha de verão/)).toBeVisible();
  expect(confirmations).toBe(0);
  await page.getByRole('button',{name:'Confirmar ação'}).click();
  await expect(page.getByRole('button',{name:'Confirmar ação'})).toHaveCount(0);
  expect(confirmations).toBe(1);
  await expect(page.getByRole('img',{name:'Imagem gerada'})).toHaveAttribute('src','https://example.com/imagem.png');
});

test('recupera vídeo e confirma post e campanha com orçamento legível', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-session');
    localStorage.setItem('refreshToken', 'isolated-refresh');
    localStorage.setItem('user', JSON.stringify({name:'QA',email:'qa@example.invalid',role:'admin',tenantId:'isolated'}));
  });
  const calls: string[] = [];
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Projeto'}]});
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({json:{plans:[]}});
    if (path === '/api/chat/conversations/c1') return route.fulfill({json:{messages:[],approvals:[
      {id:'v1',action:'Criar vídeo',parameters:{prompt:'Vídeo'},status:'completed',result:{videoUrl:'https://example.com/video.mp4'}},
      {id:'p1',action:'Agendar postagem',parameters:{caption:'Novidade',scheduledAt:'2026-11-10T12:00:00Z'},status:'pending'},
      {id:'c2',action:'Criar campanha',parameters:{name:'Campanha',dailyBudget:1500,currency:'BRL'},status:'pending'}]}});
    if (path.startsWith('/api/chat/approvals/')) { calls.push(path); return route.fulfill({json:{status:'completed',result:{id:'created'}}}); }
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat'); await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Projeto'}).click();
  await expect(page.getByLabel('Vídeo gerado')).toHaveAttribute('src','https://example.com/video.mp4');
  await expect(page.getByText('Orçamento diário')).toBeVisible();
  await expect(page.getByText(/15,00/)).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByRole('article').filter({hasText:'Agendar postagem'}).getByRole('button',{name:'Confirmar ação'}).click();
  await page.getByRole('article').filter({hasText:'Criar campanha'}).getByRole('button',{name:'Confirmar ação'}).click();
  expect(calls).toEqual(['/api/chat/approvals/p1/confirm','/api/chat/approvals/c2/confirm']);
});

test('acompanha job de vídeo até conclusão', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('token','isolated'); localStorage.setItem('refreshToken','isolated'); localStorage.setItem('user',JSON.stringify({name:'QA',role:'admin',tenantId:'isolated'})); });
  let reads = 0;
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Vídeo'}]});
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({json:{plans:[]}});
    if (path === '/api/chat/conversations/c1') { reads++; return route.fulfill({json:{messages:[],approvals:[{id:'v1',action:'Editar vídeo',parameters:{},status:'completed',result:{jobId:'j1',job: reads === 1 ? {status:'running'} : {status:'done',videoUrl:'https://example.com/video.mp4'}}}]}}); }
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat'); await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Vídeo',exact:true}).click();
  await expect(page.getByText('Status: Em andamento')).toBeVisible();
  await expect(page.getByLabel('Vídeo gerado')).toHaveAttribute('src','https://example.com/video.mp4',{timeout:10000});
  expect(reads).toBe(2);
});

test('exibe valores atuais, proposta e aviso antes de editar campanha', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('token','isolated'); localStorage.setItem('refreshToken','isolated'); localStorage.setItem('user',JSON.stringify({name:'QA',role:'admin',tenantId:'isolated'})); });
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Campanhas'}]});
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({json:{plans:[]}});
    if (path === '/api/chat/conversations/c1') return route.fulfill({json:{messages:[],approvals:[{id:'a1',action:'Editar campanha',status:'pending',parameters:{atual:{name:'Verão',dailyBudget:1500,currency:'BRL'},alterações:{dailyBudget:2000},observação:'O estado pode mudar.'}}]}});
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat'); await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Campanhas',exact:true}).last().click();
  await expect(page.getByText('Valores atuais')).toBeVisible();
  await expect(page.getByText('Alterações propostas')).toBeVisible();
  await expect(page.getByText(/15,00/)).toBeVisible(); await expect(page.getByText(/20,00/)).toBeVisible();
  await expect(page.getByText('O estado pode mudar.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirmar ação'})).toBeVisible();
});

test('retoma resposta interrompida sem reenviar mensagem', async ({page}) => {
  await page.addInitScript(() => { localStorage.setItem('token','isolated'); localStorage.setItem('refreshToken','isolated'); localStorage.setItem('user',JSON.stringify({name:'QA',role:'admin',tenantId:'isolated'})); });
  const paths: string[] = [];
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname; paths.push(path);
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Interrompida'}]});
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({json:{plans:[]}});
    if (path === '/api/chat/conversations/c1') return route.fulfill({json:{messages:[{id:'m1',role:'user',content:'Mensagem original'}],approvals:[],response_run:{id:'r1',status:'interrupted'}}});
    if (path === '/api/chat/conversations/c1/retry') return route.fulfill({contentType:'text/event-stream',body:'event: token\ndata: {"content":"Resposta retomada"}\n\nevent: done\ndata: {}\n\n'});
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat'); await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Interrompida'}).click();
  await page.getByRole('button',{name:'Retomar resposta'}).click();
  await expect(page.getByText('Resposta retomada')).toBeVisible();
  await expect(page.getByText('Mensagem original')).toHaveCount(1);
  expect(paths.filter(path => path.endsWith('/retry'))).toHaveLength(1);
  expect(paths.some(path => path.endsWith('/messages'))).toBe(false);
});

/* Funcionalidade: usar assistente no tema escuro
Cenário: o tema salvo define cores legíveis
Dado que o usuário escolheu o tema escuro
Quando abre o chat
Então o painel de mensagem usa superfície escura e texto claro. */
test('respeita o tema escuro salvo no assistente', async ({page}) => {
  await page.addInitScript(() => {localStorage.setItem('token','isolated');localStorage.setItem('refreshToken','isolated');localStorage.setItem('fury-theme','dark');localStorage.setItem('user',JSON.stringify({name:'QA',role:'admin',tenantId:'isolated'}));});
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({json:[]});
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat');
  await expect(page.locator('html')).toHaveAttribute('data-theme','escuro');
  await expect(page.locator('.ady-chat-input-shell')).toHaveCSS('background-color','rgb(20, 21, 18)');
  await expect(page.locator('.ady-chat')).toHaveCSS('color','rgb(236, 237, 239)');
});

test('não repete ação após resultado indeterminado', async ({page}) => {
  await page.addInitScript(() => {localStorage.setItem('token','isolated');localStorage.setItem('refreshToken','isolated');localStorage.setItem('user',JSON.stringify({name:'QA',role:'admin',tenantId:'isolated'}));});
  let confirmations = 0;
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Resultado incerto'}]});
    if (path === '/api/chat/conversations/c1') return route.fulfill({json:{messages:[],approvals:[{id:'a1',action:'Criar campanha',parameters:{name:'Verão'},status:'pending'}]}});
    if (path === '/api/chat/approvals/a1/confirm') { confirmations++; return route.fulfill({status:502,json:{error:'indisponível'}}); }
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat'); await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Resultado incerto'}).click();
  await page.getByRole('button',{name:'Confirmar ação'}).click();
  await expect(page.getByText(/resultado não pôde ser confirmado/i)).toBeVisible();
  await page.getByRole('button',{name:'Atualizar conversa'}).click();
  await expect(page.getByText(/resultado não pôde ser confirmado/i)).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirmar ação'})).toHaveCount(0);
  expect(confirmations).toBe(1);
});
