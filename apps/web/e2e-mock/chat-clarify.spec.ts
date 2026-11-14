import { expect, test } from '@playwright/test';

test('esclarecimento selecionado e mensagens ordenadas sobrevivem ao reload', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-session');
    localStorage.setItem('refreshToken', 'isolated-refresh');
    localStorage.setItem('user', JSON.stringify({name:'QA',email:'qa@example.invalid',role:'admin',tenantId:'isolated'}));
  });
  let selected: number | null = null;
  let answerCalls = 0;
  const messages = [{id:'m1',role:'assistant',content:'Primeira'}, {id:'m2',role:'assistant',content:'Segunda'}];
  const clar = () => ({id:'q1',run_id:'r1',message_id:'m2',question:'Qual opção?',choices:['Um','Dois'],selected_index:selected});
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({json:[{id:'c1',title:'Projeto'}]});
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({json:{plans:[]}});
    if (path === '/api/chat/conversations/c1/clarifications/q1/answer') {
      answerCalls++; selected = route.request().postDataJSON().choiceIndex;
      return route.fulfill({contentType:'text/event-stream',body:'event: done\ndata: {"message":{"id":"m3","role":"assistant","content":"Entendi"}}\n\n'});
    }
    if (path === '/api/chat/conversations/c1') return route.fulfill({json:{messages,clarifications:[clar()],approvals:[]}});
    if (path === '/api/rbac/blocked-views') return route.fulfill({json:{data:{blocked:[]}}});
    return route.fulfill({status:404,json:{error:'not found'}});
  });
  await page.goto('/chat');
  await page.getByRole('button',{name:'Somente essenciais'}).click();
  await page.getByRole('button',{name:'Projeto'}).click();
  await expect(page.getByRole('group',{name:'Qual opção?'})).toBeVisible();
  await page.getByRole('button',{name:'Dois'}).click();
  await expect(page.getByText('Entendi')).toBeVisible();
  expect(answerCalls).toBe(1);
  await page.reload();
  await expect(page.getByRole('button',{name:'Dois'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Dois'})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.ady-chat-message[data-role="assistant"]')).toHaveCount(2);
  await expect(page.locator('.ady-chat-message[data-role="assistant"]').nth(0)).toContainText('Primeira');
  await expect(page.locator('.ady-chat-message[data-role="assistant"]').nth(1)).toContainText('Segunda');
});
