import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runAlert, runWhenReady } from './qa-quota-alert.mjs';

const config = { margin: '2', owner: 'Equipe QA' };
const sub = { status: 'active', currentPeriodEnd: '2099-01-01', creativesRemaining: 3, plan: {} };

describe('Funcionalidade: aviso antecipado e bloqueio da jornada', () => {
  it('consulta HTTP real, aceita o limiar e não divulga credenciais', async () => {
    const requests = [];
    const server = createServer((req, res) => {
      requests.push([req.method, req.url]);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(req.url === '/auth/login' ? { data: { token: 'segredo-token' } } : { success: true, data: sub }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const result = await runAlert({ apiURL: `http://127.0.0.1:${server.address().port}`, email: 'privado', password: 'segredo', config });
      assert.deepEqual(result, { ok: true, reason: 'ready' });
      assert.deepEqual(requests, [['POST', '/auth/login'], ['GET', '/billing/subscription']]);
      assert.doesNotMatch(JSON.stringify(result), /segredo|privado/);
    } finally { server.close(); }
  });
  it('consulta HTTP falha fechada para saldo baixo, permissão, erro e timeout', async () => {
    let mode = 'low';
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/auth/login') return res.end(JSON.stringify({ data: { token: 'segredo' } }));
      if (mode === 'timeout') return;
      if (mode === 'permission' || mode === 'unavailable') {
        res.statusCode = mode === 'permission' ? 403 : 503;
        return res.end('segredo');
      }
      res.end(JSON.stringify({ success: true, data: { ...sub, creativesRemaining: 2 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      for (const [scenario, reason] of [['low', 'quota_insufficient'], ['permission', 'permission'], ['unavailable', 'unavailable'], ['timeout', 'timeout']]) {
        mode = scenario;
        const result = await runAlert({ apiURL: `http://127.0.0.1:${server.address().port}`, email: 'privado', password: 'segredo', config, timeoutMs: 100 });
        assert.equal(result.reason, reason);
        assert.doesNotMatch(JSON.stringify(result), /segredo|privado/);
      }
    } finally { server.closeAllConnections(); server.close(); }
  });
  it('bloqueia todas as mutações em cada falha e preserva motivo sanitizado', async () => {
    for (const reason of ['quota_insufficient', 'unknown', 'permission', 'timeout', 'unavailable', 'configuration']) {
      let mutations = 0;
      await assert.rejects(runWhenReady(async () => ({ ok: false, reason }), async () => { mutations++; }), new RegExp(reason));
      assert.equal(mutations, 0);
    }
    let mutations = 0;
    await runWhenReady(async () => ({ ok: true, reason: 'ready' }), async () => { mutations++; });
    assert.equal(mutations, 1);
  });
  it('falha fechada para login, endpoint, timeout e configuração', async () => {
    const base = { apiURL: 'http://localhost', email: 'privado', password: 'segredo', config };
    assert.equal((await runAlert({ ...base, config: {} })).reason, 'configuration');
    for (const [fetchImpl, reason] of [
      [async () => new Response('segredo', { status: 403 }), 'permission'],
      [async () => { throw new Error('segredo timeout'); }, 'timeout'],
      [async () => new Response('segredo', { status: 503 }), 'unavailable'],
      [async () => new Response('{}', { status: 200 }), 'unknown'],
    ]) {
      const result = await runAlert({ ...base, fetchImpl });
      assert.equal(result.reason, reason);
      assert.doesNotMatch(JSON.stringify(result), /segredo|privado/);
    }
  });
});
