import { expect, test } from '@playwright/test';

// Funcionalidade: coleta sequencial sem serviços reais.
// Dado planejamento vazio, quando respondo por botão/texto, então só avança um dado.
for (const width of [390,1280]) test(`coleta, alternativa livre e recuperação — ${width}`,async ({page})=>{
  await page.setViewportSize({width,height:844});
  await page.addInitScript(()=>{
    localStorage.setItem('token','isolated-session');
    localStorage.setItem('refreshToken','isolated-refresh');
    localStorage.setItem('user',JSON.stringify({name:'QA',role:'admin',tenantId:'isolated'}));
    sessionStorage.setItem('ady-chat-current','c1');
  });
  type Message={id:string;role:string;content:string};
  type Clarification={id:string;run_id:string;message_id:string;question:string;choices:string[];selected_index:number|null;dismissed_at?:string};
  const messages:Message[]=[], clarifications:Clarification[]=[], answers:string[]=[], keys:string[]=[];
  let step=0, seq=0, fail=true, effects=0;
  const questions=['Qual período?','Qual objetivo?','Qual formato?','Qual frequência?'];
  const choices=[['Este mês','Próximos 30 dias','Outro período'],['Divulgar produtos','Atrair clientes','Outra opção'],['Carrossel','Vídeo','Outra opção'],['3 vezes por semana','Diariamente','Outra opção']];
  await page.route('http://127.0.0.1:3100/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Planejamento'}]});
    if(path.endsWith('/plans')) return route.fulfill({json:{plans:[]}});
    if(path==='/api/chat/conversations/c1') return route.fulfill({json:{messages,clarifications,approvals:[],response_runs:[],client_keys:keys}});
    if(path.endsWith('/messages')||path.endsWith('/answer')){
      const body=route.request().postDataJSON();
      if(path.endsWith('/answer')&&step===2&&fail){fail=false;return route.fulfill({status:503,json:{error:'Falha temporária mockada'}});}
      keys.push(body.clientKey);
      const q=clarifications.at(-1);
      const text=path.endsWith('/answer')?q!.choices[body.choiceIndex]:body.content;
      const run=`r${++seq}`, user={id:`u${seq}`,role:'user',content:text}; messages.push(user);
      if(q&&q.selected_index===null&&!q.dismissed_at){if(path.endsWith('/answer')) q.selected_index=body.choiceIndex;else q.dismissed_at='mock-now';}
      let content:string, clarification:Clarification|undefined;
      if(text==='Pode decidir por mim') content=`Resumo: ${answers.join('; ')}. Frequência sugerida: 3 vezes por semana, conforme preferência mockada autorizada. Confirme antes de gerar conteúdo com custo.`;
      else if(text==='Outra opção') content='Qual objetivo você prefere?';
      else {
        if(step>0) answers.push(text);
        const index=step++;
        clarification={id:`q${index}`,run_id:run,message_id:`m${seq}`,question:questions[index],choices:choices[index],selected_index:null};
        content=questions[index]; clarifications.push(clarification);
      }
      const message={id:`m${seq}`,role:'assistant',content};messages.push(message);
      return route.fulfill({contentType:'text/event-stream',body:`event: done\ndata: ${JSON.stringify({message,clarification,run_id:run,user_message_id:user.id,client_key:body.clientKey})}\n\n`});
    }
    if(path==='/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    if(/generate|publish|campaign|confirm/.test(path)) effects++;
    return route.fulfill({status:404,json:{error:'isolated endpoint'}});
  });
  await page.goto('/chat'); await page.getByRole('button',{name:'Somente essenciais'}).click();
  const input=page.getByRole('textbox',{name:'Mensagem',exact:true});
  const send=async (value:string)=>{await input.fill(value);await input.press('Enter');};
  await send('Planeje minhas postagens');
  const period=page.getByRole('group',{name:questions[0],exact:true}); await expect(period).toBeVisible();
  await expect(page.getByText(questions[0],{exact:true})).toHaveCount(1);
  for(const question of questions.slice(1)) await expect(page.getByText(question,{exact:true})).toHaveCount(0);
  const month=period.getByRole('button',{name:'Este mês',exact:true});
  expect((await month.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await month.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('group',{name:questions[1],exact:true})).toBeVisible();await expect(input).toHaveValue('');
  expect(answers).toEqual(['Este mês']);
  await page.getByRole('button',{name:'Outra opção',exact:true}).click();
  await expect(page.getByText(/A conexão foi interrompida/)).toBeVisible();await page.reload();
  await expect(page.getByRole('group',{name:questions[1],exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reenviar envio pendente',exact:true}).click();
  await expect(page.getByText('Qual objetivo você prefere?',{exact:true})).toBeVisible();
  await expect(page.getByRole('group',{name:questions[2],exact:true})).toHaveCount(0);
  await send('Engajar a comunidade local');await expect(page.getByRole('group',{name:questions[2],exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Carrossel',exact:true}).click();await expect(page.getByRole('group',{name:questions[3],exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'Carrossel',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Este mês',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(answers).toEqual(['Este mês','Engajar a comunidade local','Carrossel']);
  await send('Pode decidir por mim');await expect(page.getByText(/Resumo: Este mês; Engajar a comunidade local; Carrossel/)).toBeVisible();
  await expect(page.getByText(/Confirme antes de gerar conteúdo com custo/)).toBeVisible();expect(effects).toBe(0);expect(new Set(keys).size).toBe(keys.length);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await expect(input).toBeInViewport();
});
