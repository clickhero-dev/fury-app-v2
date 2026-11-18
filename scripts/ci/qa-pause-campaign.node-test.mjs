// Funcionalidade: pausar somente a campanha exata da execução QA interrompida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseQaCampaign } from './qa-pause-campaign.mjs';

const label = 'Anúncio QA 17/11/2026 23:14:20';
const credentials = { apiURL: 'https://test.invalid/api', email: 'test@example.invalid', password: 'test', label };
function api(campaigns, { loginStatus = 200, pauseStatus = 200, confirmPause = true } = {}) {
  const calls = []; let paused = false;
  const fetchImpl = async (url, options = {}) => {
    calls.push([url, options.method ?? 'GET']);
    if (url.endsWith('/auth/login')) return Response.json({ data: { token: 'mock-token' } }, { status: loginStatus });
    if (url.endsWith('/pause')) { paused = pauseStatus === 200 && confirmPause; return Response.json({}, { status: pauseStatus }); }
    return Response.json({ data: campaigns.map(c => ({ ...c, status: paused && c.name === label ? 'paused' : c.status })) });
  };
  return { calls, fetchImpl };
}
test('pausa a campanha exata e confirma estado, sem publicar ou excluir', async () => {
  const fake = api([{ id: 'other', name: 'Outra', status: 'active' }, { id: 'qa', name: label, status: 'active' }]);
  assert.deepEqual(await pauseQaCampaign({ ...credentials, fetchImpl: fake.fetchImpl }), { paused: true });
  assert.deepEqual(fake.calls.filter(([, method]) => method !== 'GET'), [['https://test.invalid/api/auth/login', 'POST'], ['https://test.invalid/api/campaigns/qa/pause', 'PATCH']]);
});
test('não muta campanhas já pausadas', async () => {
  const fake = api([{ id: 'qa', name: label, status: 'paused' }]);
  assert.deepEqual(await pauseQaCampaign({ ...credentials, fetchImpl: fake.fetchImpl }), { paused: false });
  assert.equal(fake.calls.some(([, method]) => method === 'PATCH'), false);
});
for (const entries of [[], [{ id: 'other', name: 'Outra', status: 'active' }], [{ id: '1', name: label, status: 'active' }, { id: '2', name: label, status: 'active' }]]) {
  test('não pausa sem correspondência única e exata', async () => {
    const fake = api(entries);
    await assert.rejects(pauseQaCampaign({ ...credentials, fetchImpl: fake.fetchImpl }));
    assert.equal(fake.calls.some(([, method]) => method === 'PATCH'), false);
  });
}
test('entrada inválida não chega à API', async () => {
  const fake = api([]);
  await assert.rejects(pauseQaCampaign({ ...credentials, label: 'Campanha do cliente', fetchImpl: fake.fetchImpl }));
  assert.equal(fake.calls.length, 0);
});
for (const options of [{ loginStatus: 401 }, { pauseStatus: 403 }]) {
  test('falha de autenticação/permissão não simula sucesso', async () => {
    const fake = api([{ id: 'qa', name: label, status: 'active' }], options);
    await assert.rejects(pauseQaCampaign({ ...credentials, fetchImpl: fake.fetchImpl }));
  });
}
test('sucesso HTTP sem estado pausado não simula confirmação', async () => {
  const fake = api([{ id: 'qa', name: label, status: 'active' }], { confirmPause: false });
  await assert.rejects(pauseQaCampaign({ ...credentials, fetchImpl: fake.fetchImpl }));
});
test('estado desconhecido não recebe mutação', async () => {
  const fake = api([{ id: 'qa', name: label, status: 'unknown' }]);
  await assert.rejects(pauseQaCampaign({ ...credentials, fetchImpl: fake.fetchImpl }));
  assert.equal(fake.calls.some(([, method]) => method === 'PATCH'), false);
});
