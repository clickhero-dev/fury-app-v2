import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import {
  createTestTenant,
  createTestUser,
  cleanupDatabase,
  getAuthHeader,
} from './utils/test-helpers.js';

describe('POST /api/automation/rules', () => {
  let testUser: any;
  let testTenant: any;

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('test-tenant-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'test@fury.test');
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it.skip('deve salvar regra com threshold válido', async () => {
    const response = await request(app)
      .post('/api/automation/rules')
      .set(getAuthHeader(testUser.token))
      .send({
        name: 'Pausar campanhas com CPA alto',
        description: 'Pausa automaticamente campanhas que excedem o CPA máximo',
        trigger: 'cpa_exceeds',
        threshold: 5000, // 50,00 em centavos
        action: 'pause_campaign',
        enabled: true,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.id).toBeDefined();
  });

  it.skip('deve rejeitar threshold negativo (400)', async () => {
    const response = await request(app)
      .post('/api/automation/rules')
      .set(getAuthHeader(testUser.token))
      .send({
        name: 'Pausar campanhas com CPA alto',
        trigger: 'cpa_exceeds',
        threshold: -100,
        action: 'pause_campaign',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});

describe('GET /api/automation/rules', () => {
  let testUser: any;
  let testTenant: any;

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('test-tenant-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'test@fury.test');
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it.skip('deve retornar apenas regras do tenant autenticado', async () => {
    const otherTenant = await createTestTenant('other-tenant-' + Date.now());
    const otherUser = await createTestUser(otherTenant.id, 'other@fury.test');

    // Criar regras para ambos tenants
    await request(app)
      .post('/api/automation/rules')
      .set(getAuthHeader(testUser.token))
      .send({
        name: 'Regra do tenant 1',
        trigger: 'cpa_exceeds',
        threshold: 5000,
        action: 'pause_campaign',
      });

    await request(app)
      .post('/api/automation/rules')
      .set(getAuthHeader(otherUser.token))
      .send({
        name: 'Regra do tenant 2',
        trigger: 'cpa_exceeds',
        threshold: 5000,
        action: 'pause_campaign',
      });

    // Buscar regras do tenant 1
    const response = await request(app)
      .get('/api/automation/rules')
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].name).toBe('Regra do tenant 1');
  });
});
