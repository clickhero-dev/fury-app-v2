import { expect, test } from '@playwright/test';

for (const width of [375,1280]) {
  test(`revisão consolidada, confirmação exata e resultado parcial — ${width}`, async ({page}) => {
    await page.setViewportSize({width,height:812});
    await page.addInitScript(() => {
      localStorage.setItem('token','isolated-batch');
      localStorage.setItem('refreshToken','isolated-batch-refresh');
      localStorage.setItem('user',JSON.stringify({name:'QA',role:'admin',tenantId:'isolated',email:'qa@example.invalid'}));
    });
    const approvals = [
      {id:'a',action:'Criar imagem',status:'pending',parameters:{prompt:'Café na praia '+ 'longo'.repeat(80),imageUrl:'https://example.test/proposta.svg',model:'technical-model'}},
      {id:'b',action:'Criar campanha',status:'pending',parameters:{name:'Café',dailyBudget:1000,currency:'BRL',objective:'OUTCOME_TRAFFIC',status:'PAUSED'}},
    ];
    const reviewed = {reviewToken:'12345678-1234-4234-8234-123456789012',version:1,digest:'a'.repeat(64),approvalIds:['a','b'],expiresAt:'2099-01-01T00:00:00Z',items:approvals.map((item,index)=>({
      id:item.id,method:'POST',path:index?'/api/campaigns/create':'/api/studio/ai/generate-image',parameters:item.parameters,expiresAt:'2099-01-01T00:00:00Z',cost:{known:false,value:null},quota:index?{known:false,value:null}:{known:true,value:{unit:'image',amount:1}},
    }))};
    const posts: {path:string;body:unknown}[]=[];
    await page.route('https://example.test/proposta.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1000"><rect width="2000" height="1000" fill="#245"/></svg>'}));
    await page.route('http://127.0.0.1:3100/**',async route=>{
      const request=route.request(), path=new URL(request.url()).pathname;
      if(request.method()==='POST') posts.push({path,body:request.postDataJSON()});
      if(path.endsWith('/rbac/blocked-views')) return route.fulfill({json:{data:{blocked:[]}}});
      if(path.endsWith('/plans')) return route.fulfill({json:{plans:[]}});
      if(path==='/api/chat/conversations') return route.fulfill({json:[{id:'conv',title:'Revisar café'}]});
      if(path==='/api/chat/conversations/conv') return route.fulfill({json:{messages:[],approvals}});
      if(path.endsWith('/approvals/review')) return route.fulfill({json:reviewed});
      if(path.endsWith('/approvals/confirm-batch')) return route.fulfill({json:{items:[{id:'a',status:'completed',result:{}},{id:'b',status:'unknown',result:{error:'segredo privado'}}],partialFailure:true}});
      return route.fulfill({status:404,json:{error:'isolated'}});
    });
    await page.goto('/chat');
    await page.getByRole('button',{name:'Somente essenciais'}).click();
    if(width<768) await page.getByRole('button',{name:'Mostrar conversas'}).click();
    await page.getByRole('button',{name:'Revisar café',exact:true}).click();
    const batch=page.getByRole('region',{name:'Revisar ações em lote'});
    expect(await batch.locator('label').first().evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await batch.getByRole('checkbox',{name:'Criar imagem'}).check();
    await batch.getByRole('checkbox',{name:'Criar campanha'}).check();
    await batch.getByRole('button',{name:'Revisar selecionados'}).click();
    await expect(batch.getByText(/Consome 1 imagem/)).toBeVisible();
    await expect(batch.getByText(/Cota não informado/)).toBeVisible();
    await expect(batch.getByText(/R\$\s?10,00 por dia/)).toBeVisible();
    await expect(batch.getByText(/Pausado/)).toBeVisible();
    await expect(batch.getByText(/OUTCOME_TRAFFIC/)).toHaveCount(0);
    await expect(batch.getByText('Modelo: technical-model')).not.toBeVisible();
    const preview=batch.getByRole('img',{name:/Prévia da imagem proposta/});
    await expect(preview).toHaveAttribute('src','https://example.test/proposta.svg');
    await expect(preview).toBeVisible();
    expect(await preview.evaluate(node=>node.getBoundingClientRect().width)).toBeLessThanOrEqual((await batch.boundingBox())!.width);
    await batch.getByRole('button',{name:'Confirmar 2 ações revisadas'}).click();
    await expect(page.locator('[data-approval-id="a"]')).toHaveAttribute('data-status','completed');
    await expect(page.locator('[data-approval-id="b"]')).toHaveAttribute('data-status','unknown');
    await expect(batch.getByText(/Resultado não confirmado/)).toBeVisible();
    await expect(page.getByText('segredo privado')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Confirmar ação'})).toHaveCount(0);
    expect(posts).toEqual([
      {path:'/api/chat/conversations/conv/approvals/review',body:{approvalIds:['a','b']}},
      {path:'/api/chat/conversations/conv/approvals/confirm-batch',body:{approvalIds:['a','b'],reviewToken:reviewed.reviewToken,version:1,digest:reviewed.digest}},
    ]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
}
