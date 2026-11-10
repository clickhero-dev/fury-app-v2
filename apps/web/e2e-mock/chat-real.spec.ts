/*
Funcionalidade: aprovar agendamento pelo chat com serviços reais
Cenário: uma proposta é confirmada uma única vez
Dado uma proposta de postagem no PostgreSQL isolado
Quando o usuário confirma na interface
Então API e serviço de chat persistem uma postagem e concluem a aprovação
*/
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
const postgres: typeof import('postgres') = apiRequire('postgres');
const jwt: typeof import('jsonwebtoken') = apiRequire('jsonwebtoken');
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.CHAT_E2E_DATABASE_URL;
const secret = process.env.CHAT_E2E_JWT_SECRET;
const webUrl = process.env.CHAT_E2E_WEB_URL;
test.skip(!databaseUrl || !secret || !webUrl, 'Requer stack isolada de chat e CHAT_E2E_DATABASE_URL, CHAT_E2E_JWT_SECRET e CHAT_E2E_WEB_URL');

test('aprova ações e retoma conversa com serviços reais', async ({page}) => {
  test.setTimeout(90000);
  const db = postgres(databaseUrl!, {max:1});
  const tenant = randomUUID(), user = randomUUID(), conversation = randomUUID(), approval = randomUUID();
  const caption = `Teste isolado ${approval}`;
  try {
    await db`insert into tenants(id,name,slug) values (${tenant},'Teste chat',${tenant})`;
    await db`insert into users(id,tenant_id,email) values (${user},${tenant},${`${user}@example.invalid`})`;
    await db`insert into chat_conversations(id,tenant_id,user_id,title) values (${conversation},${tenant},${user},'Proposta isolada')`;
    const body = {caption,postType:'image',platform:'instagram',date:'2030-11-10',scheduledAt:'2030-11-10T12:00:00Z',imageUrl:'https://example.com/test.png'};
    await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,expires_at) values (${approval},${tenant},${user},${conversation},'POST','/api/planner/posts',${db.json(body)}::jsonb,now()+interval '1 hour')`;
    const token = jwt.sign({userId:user,tenantId:tenant,email:`${user}@example.invalid`,role:'admin'},secret!,{expiresIn:'10m'});
    await page.addInitScript(({token,tenant,user})=>{localStorage.setItem('token',token);localStorage.setItem('refreshToken','isolated');localStorage.setItem('user',JSON.stringify({name:'Teste',email:`${user}@example.invalid`,role:'admin',tenantId:tenant}));},{token,tenant,user});
    await page.route('**/api/meta/connections',r=>r.fulfill({json:{data:[{id:'test',selectedAdAccountId:'act_test'}]}}));
    await page.route('**/api/policy/current',r=>r.fulfill({json:{data:{accepted:true}}}));
    await page.goto(`${webUrl}/chat`);
    await page.getByRole('button',{name:'Somente essenciais'}).click();
    await page.getByRole('button',{name:'Proposta isolada'}).click();
    await expect(page.getByText(caption)).toBeVisible();
    const before = await db`select count(*)::int as total from social_posts where tenant_id=${tenant} and caption=${caption}`;
    expect(before[0].total).toBe(0);
    await page.getByRole('button',{name:'Confirmar ação'}).click();
    await expect(page.getByText('Status: Concluída')).toBeVisible({timeout:30000});
    const rows = await db`select status from chat_approvals where id=${approval}`;
    const posts = await db`select count(*)::int as total from social_posts where tenant_id=${tenant} and caption=${caption}`;
    expect(rows[0].status).toBe('completed'); expect(posts[0].total).toBe(1);
    const message = randomUUID();
    await db`insert into chat_messages(id,conversation_id,role,content) values (${message},${conversation},'user','Mensagem para retomar')`;
    await db`insert into chat_response_runs(conversation_id,user_message_id,lease_id,status,lease_until) values (${conversation},${message},${randomUUID()},'running',now()-interval '1 minute')`;
    await page.reload();
    await page.getByRole('button',{name:'Proposta isolada'}).click();
    const retryRequest = page.waitForRequest(req => req.url().endsWith('/retry') && req.method() === 'POST');
    await page.getByRole('button',{name:'Retomar resposta'}).click();
    expect((await retryRequest).headers().authorization).toBe(`Bearer ${token}`);
    await expect(page.getByText('Resposta retomada com sucesso.')).toBeVisible({timeout:30000});
    const saved = await db`select role,content from chat_messages where conversation_id=${conversation}`;
    expect(saved.filter(row => row.content === 'Mensagem para retomar')).toHaveLength(1);
    expect(saved.filter(row => row.content === 'Resposta retomada com sucesso.')).toHaveLength(1);
    const approvalsAfterRetry = await db`select count(*)::int as total from chat_approvals where conversation_id=${conversation}`;
    expect(approvalsAfterRetry[0].total).toBe(1);
    const versions = await db`select u.xmin::text as uv,t.xmin::text as tv from users u join tenants t on t.id=u.tenant_id where u.id=${user}`;
    const profileApproval = randomUUID();
    const profileBody = {userVersion:versions[0].uv,tenantVersion:versions[0].tv,name:'Nome atualizado'};
    await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,expires_at) values (${profileApproval},${tenant},${user},${conversation},'PATCH','/api/auth/me/chat-update',${db.json(profileBody)}::jsonb,now()+interval '1 hour')`;
    await page.reload(); await page.getByRole('button',{name:'Proposta isolada'}).click();
    const profile = page.getByRole('article').filter({hasText:'Atualizar perfil e negócio'});
    await expect(profile).toContainText('Nome atualizado');
    await profile.getByRole('button',{name:'Confirmar ação'}).click();
    await expect(profile).toContainText('Concluída');
    const updated = await db`select name from users where id=${user}`;
    expect(updated[0].name).toBe('Nome atualizado');
    const profileStatus = await db`select status from chat_approvals where id=${profileApproval}`;
    expect(profileStatus[0].status).toBe('completed');
    const imageApproval = randomUUID();
    const imageBody = {model:'black-forest-labs/flux.2-klein-4b',prompt:'Uma imagem para o café'};
    await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,expires_at) values (${imageApproval},${tenant},${user},${conversation},'POST','/api/studio/ai/generate-image',${db.json(imageBody)}::jsonb,now()+interval '1 hour')`;
    await page.reload(); await page.getByRole('button',{name:'Proposta isolada'}).click();
    const image = page.getByRole('article').filter({hasText:'Criar imagem'});
    await expect(image).toContainText('Uma imagem para o café');
    await image.getByRole('button',{name:'Confirmar ação'}).click();
    await expect(image.getByRole('img',{name:'Imagem gerada'})).toHaveAttribute('src','https://example.invalid/imagem-e2e.png');
    const imageStatus = await db`select status from chat_approvals where id=${imageApproval}`;
    expect(imageStatus[0].status).toBe('completed');
    await db`insert into brand_kits(tenant_id,primary_color) values (${tenant},'#000000')`;
    const brandVersion = await db`select xmin::text as version from brand_kits where tenant_id=${tenant}`;
    const brandApproval = randomUUID();
    const brandBody = {version:brandVersion[0].version,primary_color:'#123456'};
    await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,expires_at) values (${brandApproval},${tenant},${user},${conversation},'PATCH','/api/brand-kit/chat-update',${db.json(brandBody)}::jsonb,now()+interval '1 hour')`;
    await page.reload(); await page.getByRole('button',{name:'Proposta isolada'}).click();
    const brand = page.getByRole('article').filter({hasText:'Atualizar marca'});
    await brand.getByRole('button',{name:'Confirmar ação'}).click();
    await expect(brand).toContainText('Concluída');
    const savedBrand = await db`select primary_color from brand_kits where tenant_id=${tenant}`;
    expect(savedBrand[0].primary_color).toBe('#123456');
    const videoApproval = randomUUID();
    const videoBody = {prompt:'Um vídeo para o café',photoIds:[],aspectRatio:'16:9',duration:15,scenes:[{start:0,end:15,visual:'Café sendo servido',narration:'Venha conhecer'}]};
    await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,expires_at) values (${videoApproval},${tenant},${user},${conversation},'POST','/api/studio/video/jobs',${db.json(videoBody)}::jsonb,now()+interval '1 hour')`;
    await page.reload(); await page.getByRole('button',{name:'Proposta isolada'}).click();
    const video = page.getByRole('article').filter({hasText:'Criar vídeo'});
    await video.getByRole('button',{name:'Confirmar ação'}).click();
    await expect(video.getByLabel('Vídeo gerado')).toHaveAttribute('src','https://example.invalid/video-e2e.mp4',{timeout:15000});
    const videoStatus = await db`select status,result from chat_approvals where id=${videoApproval}`;
    expect(videoStatus[0].status).toBe('completed'); expect(videoStatus[0].result.job.status).toBe('done');
    const imageEditApproval = randomUUID(), imageAsset = randomUUID();
    const imageEditBody = {assetId:imageAsset,version:'1',feedback:'Aumentar contraste'};
    await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,expires_at) values (${imageEditApproval},${tenant},${user},${conversation},'POST','/api/studio/ai/chat-edit',${db.json(imageEditBody)}::jsonb,now()+interval '1 hour')`;
    await page.reload(); await page.getByRole('button',{name:'Proposta isolada'}).click();
    const imageEdit = page.getByRole('article').filter({hasText:'Editar imagem'});
    await imageEdit.getByRole('button',{name:'Confirmar ação'}).click();
    await expect(imageEdit.getByRole('img',{name:'Imagem gerada'})).toHaveAttribute('src','https://example.invalid/imagem-editada.png');
    const videoEditApproval = randomUUID(), videoAsset = randomUUID();
    const videoEditPath = `/api/studio/video/assets/${videoAsset}/chat-adjust`;
    await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,expires_at) values (${videoEditApproval},${tenant},${user},${conversation},'POST',${videoEditPath},${db.json({version:'1',feedback:'Ajustar ritmo'})}::jsonb,now()+interval '1 hour')`;
    await page.reload(); await page.getByRole('button',{name:'Proposta isolada'}).click();
    const videoEdit = page.getByRole('article').filter({hasText:'Editar vídeo'});
    await videoEdit.getByRole('button',{name:'Confirmar ação'}).click();
    await expect(videoEdit.getByLabel('Vídeo gerado')).toHaveAttribute('src','https://example.invalid/video-e2e.mp4',{timeout:15000});
    const post = await db`select id,xmin::text as version from social_posts where tenant_id=${tenant} and caption=${caption}`;
    const cancelApproval = randomUUID(), cancelPath = `/api/planner/posts/${post[0].id}/chat-cancel`;
    await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,expires_at) values (${cancelApproval},${tenant},${user},${conversation},'PATCH',${cancelPath},${db.json({version:post[0].version})}::jsonb,now()+interval '1 hour')`;
    await page.reload(); await page.getByRole('button',{name:'Proposta isolada'}).click();
    const cancel = page.getByRole('article').filter({hasText:'Cancelar agendamento'});
    await cancel.getByRole('button',{name:'Confirmar ação'}).click(); await expect(cancel).toContainText('Concluída');
    const cancelled = await db`select status,scheduled_at from social_posts where id=${post[0].id}`;
    expect(cancelled[0].status).toBe('draft'); expect(cancelled[0].scheduled_at).toBeNull();
    const campaignId = randomUUID();
    const createAdApproval = randomUUID(), createAdPath = `/api/campaigns/${campaignId}/chat-ads-create`;
    const adBody = {version:'a'.repeat(64),name:'Anúncio isolado',adsetId:'111',creativeId:'222'};
    await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,expires_at) values (${createAdApproval},${tenant},${user},${conversation},'POST',${createAdPath},${db.json(adBody)}::jsonb,now()+interval '1 hour')`;
    await page.reload(); await page.getByRole('button',{name:'Proposta isolada'}).click();
    const createAd = page.getByRole('article').filter({hasText:'Criar anúncio pausado'});
    await createAd.getByRole('button',{name:'Confirmar ação'}).click(); await expect(createAd).toContainText('Concluída');
    const createdAdStatus = await db`select status,result from chat_approvals where id=${createAdApproval}`;
    expect(createdAdStatus[0].status).toBe('completed'); expect(createdAdStatus[0].result.data.status).toBe('PAUSED');
    for (const currency of [undefined, 'BRL'] as const) {
      const id = randomUUID(); const body = {action:'budget',version:'a'.repeat(64),dailyBudget:1500};
      const display = {atual:{name:currency ? 'Conta em reais' : 'Conta antiga',...(currency ? {currency} : {})},alterações:{dailyBudget:1500}};
      await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,display,expires_at) values (${id},${tenant},${user},${conversation},'PATCH',${`/api/campaigns/${campaignId}/chat-update`},${db.json(body)}::jsonb,${db.json(display)}::jsonb,now()+interval '1 hour')`;
      await page.reload(); await page.getByRole('button',{name:'Proposta isolada'}).click();
      const card = page.getByRole('article').filter({hasText:currency ? 'Conta em reais' : 'Conta antiga'});
      if (!currency) {
        await expect(card).toContainText('Expirada'); await expect(card).toContainText('moeda não confirmada');
        await expect(card.getByRole('button',{name:'Confirmar ação'})).toHaveCount(0);
        const rejected = await page.request.post(`${process.env.CHAT_E2E_API_URL ?? 'http://127.0.0.1:3199/api'}/chat/approvals/${id}/confirm`,{headers:{Authorization:`Bearer ${token}`}});
        expect(rejected.status()).toBe(404);
      } else {
        await expect(card).toContainText('15,00'); await card.getByRole('button',{name:'Confirmar ação'}).click(); await expect(card).toContainText('Concluída');
      }
    }
    for (const item of [
      {id:randomUUID(),path:`/api/campaigns/${campaignId}/chat-update`,action:'Alterar campanha'},
      {id:randomUUID(),path:`/api/campaigns/${campaignId}/chat-ads/12345`,action:'Alterar anúncio'},
    ]) {
      const actionBody = {action:'pause',version:'a'.repeat(64)};
      await db`insert into chat_approvals(id,tenant_id,user_id,conversation_id,method,path,body,expires_at) values (${item.id},${tenant},${user},${conversation},'PATCH',${item.path},${db.json(actionBody)}::jsonb,now()+interval '1 hour')`;
      await page.reload(); await page.getByRole('button',{name:'Proposta isolada'}).click();
      const card = page.getByRole('article').filter({hasText:item.action}).last();
      await card.getByRole('button',{name:'Confirmar ação'}).click();
      await expect(card).toContainText('Concluída');
      const savedAction = await db`select status from chat_approvals where id=${item.id}`;
      expect(savedAction[0].status).toBe('completed');
    }
  } finally { await db`delete from tenants where id=${tenant}`; await db.end(); }
});
