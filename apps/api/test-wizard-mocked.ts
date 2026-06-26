/**
 * Script standalone para testar createCampaignFromWizard com MOCKS.
 * Simula o ambiente exato de produção (dados do Neon, Meta API real)
 * mas com controle total sobre cada camada.
 *
 * Uso: npx tsx test-wizard-mocked.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── DADOS DE PRODUÇÃO ────────────────────────────────────────────────────
const PROD_TENANT_ID = '93c8e8e9-7c8d-4e17-a5be-ee48b916bb41';
const PROD_AD_ACCOUNT_ID = 'act_2141634409570732';

// Simula o token criptografado no formato iv:authTag:encrypted
const MOCK_ENCRYPTED_TOKEN = 'a1b2c3d4e5f6:a7b8c9d0e1f2:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// ─── MOCKS ─────────────────────────────────────────────────────────────────
const {
  dbMock,
  mockDecryptMetaToken,
  mockMetaApiCall,
  mockUploadAdImage,
  mockSearchMetaCityLocations,
  mockInvalidateCache,
  mockGetResolvedTenantAssetSelection,
  mockGetMetaLocationsCache,
  mockSetMetaLocationsCache,
} = vi.hoisted(() => ({
  dbMock: {
    query: {
      metaConnections: { findFirst: vi.fn() },
      creativeAssets: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => [{ id: 'db-camp-001' }]),
      })),
    })),
  } as any,
  mockDecryptMetaToken: vi.fn(),
  mockMetaApiCall: vi.fn(),
  mockUploadAdImage: vi.fn(),
  mockSearchMetaCityLocations: vi.fn(),
  mockInvalidateCache: vi.fn(),
  mockGetResolvedTenantAssetSelection: vi.fn().mockResolvedValue({ pages: [] }),
  mockGetMetaLocationsCache: vi.fn().mockResolvedValue(null),
  mockSetMetaLocationsCache: vi.fn(),
}));

vi.mock('@fury/db', () => ({
  db: dbMock,
  campaigns: {},
  metaConnections: {},
  creativeAssets: {},
  automationRules: {},
  furyInsights: {},
  tenants: {},
  users: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn(() => ({ type: 'desc' })),
  isNull: vi.fn(() => ({ type: 'isNull' })),
}));

vi.mock('../utils/crypto.js', () => ({
  decryptMetaToken: mockDecryptMetaToken,
}));

vi.mock('../lib/meta-api.js', () => ({
  metaApiCall: mockMetaApiCall,
  uploadAdImage: mockUploadAdImage,
  searchMetaCityLocations: mockSearchMetaCityLocations,
}));

vi.mock('../middleware/errorHandler.js', () => {
  class AppError extends Error {
    statusCode: number;
    code: string;
    details?: Record<string, unknown>;
    constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
    }
  }
  return { AppError };
});

vi.mock('../lib/campaigns-cache.js', () => ({
  invalidateCampaignsCache: mockInvalidateCache,
}));

vi.mock('../lib/locations-cache.js', () => ({
  getMetaLocationsCache: mockGetMetaLocationsCache,
  setMetaLocationsCache: mockSetMetaLocationsCache,
}));

vi.mock('../services/meta.service.js', () => ({
  getResolvedTenantAssetSelection: mockGetResolvedTenantAssetSelection,
}));

// ─── IMPORT ────────────────────────────────────────────────────────────────
import { createCampaignFromWizard } from './src/services/campaigns.service.js';
import type { CreateWizardCampaignArgs } from './src/services/campaigns.service.js';

// ─── HELPER: simula meta_connections completo ──────────────────────────────
function makeProdMetaConnection() {
  return {
    id: 'conn-prod-001',
    tenantId: PROD_TENANT_ID,
    metaUserId: 'mu_123456',
    accessToken: MOCK_ENCRYPTED_TOKEN,
    tokenExpiresAt: new Date('2027-01-01'),
    adAccounts: [{ id: PROD_AD_ACCOUNT_ID }],
    selectedAdAccountId: PROD_AD_ACCOUNT_ID,
    selectedBusinessIds: ['biz_123'],
    selectedPageIds: ['999888777666555'],
    selectedAdAccountIds: [PROD_AD_ACCOUNT_ID],
    selectedWhatsappNumberIds: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
  };
}

function setupSuccess() {
  // Configura mocks para fluxo feliz
  dbMock.query.metaConnections.findFirst.mockResolvedValue(makeProdMetaConnection());
  mockDecryptMetaToken.mockReturnValue('EAAC...real_token');
  mockSearchMetaCityLocations.mockResolvedValue([
    { key: '2421217', name: 'São Paulo', region: 'São Paulo (state)', country_code: 'BR', type: 'city' },
  ]);
  mockMetaApiCall
    .mockResolvedValueOnce({ id: 'camp_prod_001' })     // campaign
    .mockResolvedValueOnce({ id: 'adset_prod_001' })    // adset
    .mockResolvedValueOnce({ id: 'creative_prod_001' }) // creative
    .mockResolvedValueOnce({ id: 'ad_prod_001' });      // ad
  mockUploadAdImage.mockResolvedValue('hash_abc123');
}

function resetMocks() {
  vi.clearAllMocks();
}

// ─── PAYLOAD DE PRODUÇÃO (simula o que o frontend envia) ───────────────────
const prodPayload: CreateWizardCampaignArgs = {
  tenantId: PROD_TENANT_ID,
  objective: 'visits',
  creativeUploadUrl: 'https://placehold.co/600x600?text=FURY+Ad',
  headline: 'Promoção Imperdível!',
  primaryText: 'Aproveite ofertas exclusivas esta semana.',
  destinationUrl: 'https://clickhero.com.br/promo',
  locationCity: 'São Paulo',
  locationRadiusKm: 15,
  ageMin: 18,
  ageMax: 55,
  gender: 'all',
  dailyBudgetBrl: 30,
  durationDays: 14,
};

// ─── EXECUÇÃO ──────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  TESTE DO WIZARD COM MOCKS (DADOS DE PRODUÇÃO)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Tenant: ${PROD_TENANT_ID}`);
  console.log(`  AdAccount: ${PROD_AD_ACCOUNT_ID}`);
  console.log(`  Objetivo: ${prodPayload.objective}`);
  console.log(`  Cidade: ${prodPayload.locationCity}`);
  console.log('');

  // ─── Teste 1: Fluxo feliz ─────────────────────────────────
  console.log('─── TESTE 1: Fluxo feliz (mock Meta retorna sucesso) ───');
  resetMocks();
  setupSuccess();

  try {
    const start = Date.now();
    const result = await createCampaignFromWizard(prodPayload);
    const elapsed = Date.now() - start;
    console.log('✅ SUCESSO em', elapsed, 'ms');
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('❌ FALHOU!');
    console.error('  name:', err.name);
    console.error('  message:', err.message);
    console.error('  code:', err.code);
    console.error('  statusCode:', err.statusCode);
    console.error('  metaCode:', err.metaCode);
    console.error('  metaSubcode:', err.metaSubcode);
    console.error('  details:', JSON.stringify(err.details));
    if (err.stack) {
      console.error('  STACK (primeiras 5):');
      err.stack.split('\n').slice(0, 5).forEach((l, i) => console.error(`    ${i}: ${l.trim()}`));
    }
  }

  // ─── Teste 2: Meta API retorna INVALID_PARAMETER na etapa campaign ───
  console.log('\n─── TESTE 2: Meta retorna INVALID_PARAMETER (campaign) ───');
  resetMocks();
  dbMock.query.metaConnections.findFirst.mockResolvedValue(makeProdMetaConnection());
  mockDecryptMetaToken.mockReturnValue('EAAC...real_token');
  mockSearchMetaCityLocations.mockResolvedValue([
    { key: '2421217', name: 'São Paulo', region: 'São Paulo (state)', country_code: 'BR', type: 'city' },
  ]);
  mockMetaApiCall.mockRejectedValue(
    Object.assign(new Error('[Meta API] 100: Invalid parameter'), {
      metaCode: 100,
      httpStatus: 400,
      metaUserMsg: 'Parâmetro inválido na chamada',
    })
  );

  try {
    await createCampaignFromWizard(prodPayload);
    console.log('⚠️  NÃO falhou (inesperado)');
  } catch (err: any) {
    console.log('✅ Capturado corretamente:');
    console.log('  code:', err.code, '(esperado: META_API_ERROR)');
    console.log('  statusCode:', err.statusCode, '(esperado: 502)');
    console.log('  message:', err.message);
    if (err.details) console.log('  details:', JSON.stringify(err.details));
  }

  // ─── Teste 3: Meta API retorna erro OAuth (token expirado) ────
  console.log('\n─── TESTE 3: Meta retorna OAuthException (token expirado) ───');
  resetMocks();
  dbMock.query.metaConnections.findFirst.mockResolvedValue(makeProdMetaConnection());
  mockDecryptMetaToken.mockReturnValue('EAAC...real_token');
  mockSearchMetaCityLocations.mockResolvedValue([
    { key: '2421217', name: 'São Paulo', region: 'São Paulo (state)', country_code: 'BR', type: 'city' },
  ]);
  mockMetaApiCall.mockRejectedValue(
    Object.assign(new Error('[Meta API] 190: Error validating access token'), {
      metaCode: 190,
      httpStatus: 400,
    })
  );

  try {
    await createCampaignFromWizard(prodPayload);
    console.log('⚠️  NÃO falhou (inesperado)');
  } catch (err: any) {
    console.log('✅ Capturado corretamente:');
    console.log('  code:', err.code, '(esperado: META_TOKEN_EXPIRED)');
    console.log('  statusCode:', err.statusCode, '(esperado: 401)');
  }

  // ─── Teste 4: Falha na busca de cidade ─────────────────────
  console.log('\n─── TESTE 4: Falha na busca de cidade (searchMetaCityLocations) ───');
  resetMocks();
  dbMock.query.metaConnections.findFirst.mockResolvedValue(makeProdMetaConnection());
  mockDecryptMetaToken.mockReturnValue('EAAC...real_token');
  mockSearchMetaCityLocations.mockRejectedValue(new Error('Network error'));

  try {
    await createCampaignFromWizard(prodPayload);
    console.log('⚠️  NÃO falhou (inesperado)');
  } catch (err: any) {
    console.log('✅ Capturado corretamente:');
    console.log('  code:', err.code);
    console.log('  statusCode:', err.statusCode);
    console.log('  message:', err.message);
  }

  // ─── Teste 5: Erro não-Meta (erro inesperado) ──────────────
  console.log('\n─── TESTE 5: Erro inesperado (não é da Meta API) ───');
  resetMocks();
  dbMock.query.metaConnections.findFirst.mockResolvedValue(makeProdMetaConnection());
  mockDecryptMetaToken.mockReturnValue('EAAC...real_token');
  mockSearchMetaCityLocations.mockResolvedValue([
    { key: '2421217', name: 'São Paulo', region: 'São Paulo (state)', country_code: 'BR', type: 'city' },
  ]);
  mockMetaApiCall.mockRejectedValue(new TypeError('fetch failed'));

  try {
    await createCampaignFromWizard(prodPayload);
    console.log('⚠️  NÃO falhou (inesperado)');
  } catch (err: any) {
    console.log('✅ Capturado corretamente:');
    console.log('  code:', err.code, '(esperado: META_API_ERROR)');
    console.log('  statusCode:', err.statusCode, '(esperado: 502)');
    console.log('  message:', err.message);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TODOS OS TESTES CONCLUÍDOS');
  console.log('═══════════════════════════════════════════════════');
}

// Executa como script standalone
// (vitest não vai executar isso via describe/it)
if (process.argv[1]?.includes('test-wizard-mocked')) {
  main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}

// Exporta para vitest
export { main };
