#!/usr/bin/env tsx
/**
 * generate-swagger.ts
 * Gera apps/api/swagger.json a partir de:
 *   - scripts/routes-metadata.ts (mapeamento rota → descrição/tag/schema)
 *   - swagger.spec.ts (schemas OpenAPI reutilizáveis)
 *
 * Uso:
 *   npx tsx apps/api/scripts/generate-swagger.ts
 *   OU via npm:  npm run swagger:generate
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// ── Dynamic imports ─────────────────────────────────────────────────
// tsx resolve .ts natively; tsc compilado usa .js
async function loadModule(name: string) {
  try { return await import(name + '.ts'); } catch { /* ok */ }
  try { return await import(name + '.js'); } catch { /* ok */ }
  return await import(name);
}

// ── OpenAPI helpers ─────────────────────────────────────────────────
const SEC_SCHEME = { bearerAuth: [] };

function pathParamsFromKey(path: string): Record<string, unknown>[] {
  const params: Record<string, unknown>[] = [];
  const re = /:([a-zA-Z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    params.push({
      name: m[1]!,
      in: 'path',
      required: true,
      schema: { type: 'string', format: m[1]!.toLowerCase().includes('id') ? 'uuid' : 'string' },
    });
  }
  return params;
}

function resolveRef(name: string): Record<string, unknown> {
  return { $ref: `#/components/schemas/${name}` };
}

// Schemas fixos embutidos (para não depender de swagger.spec.ts no script)
const BUILTIN_SCHEMAS: Record<string, Record<string, unknown>> = {
  SuccessResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {},
      timestamp: { type: 'string', format: 'date-time' },
    },
  },
  Error: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'NOT_FOUND' },
          message: { type: 'string', example: 'Resource not found' },
        },
      },
      timestamp: { type: 'string', format: 'date-time' },
    },
  },
  ValidationError: {
    type: 'object',
    properties: {
      error: { type: 'string', example: 'Validation error' },
      details: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'array', items: { type: 'string' } },
            message: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  },
};

// ── Main ────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🔍 Loading route metadata...');
  const { ROUTE_METADATA } = await loadModule('./routes-metadata') as {
    ROUTE_METADATA: Record<string, Record<string, unknown>>;
  };

  console.log('📦 Loading schemas from swagger.spec.ts...');
  let specSchemas: Record<string, unknown> = {};
  try {
    // Try to load compiled first, then source
    const specModule = await loadModule('../src/swagger.spec');
    if (specModule?.swaggerSpec?.components?.schemas) {
      specSchemas = specModule.swaggerSpec.components.schemas as Record<string, unknown>;
    }
  } catch (e) {
    console.log('⚠️  Could not load swagger.spec.ts — using built-in schemas only');
  }

  // Merge schemas: built-in wins over spec (safety)
  const allSchemas = { ...specSchemas, ...BUILTIN_SCHEMAS };

  // ── Build paths ──────────────────────────────────────────────────
  const paths: Record<string, Record<string, unknown>> = {};

  for (const [routeKey, meta] of Object.entries(ROUTE_METADATA)) {
    const parts = routeKey.split(' ');
    const method = parts[0]!.toLowerCase();
    const path = parts.slice(1).join(' ');
    const normPath = path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

    if (!paths[normPath]) paths[normPath] = {};

    const op: Record<string, unknown> = {
      operationId: `${method}_${normPath.replace(/\//g, '_').replace(/{|}/g, '')}`.replace(/__+/g, '_'),
      summary: (meta as any).summary || '',
      tags: (meta as any).tags || [],
      responses: {
        '200': { description: 'OK', content: { 'application/json': { schema: resolveRef('SuccessResponse') } } },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
        '403': { $ref: '#/components/responses/ForbiddenError' },
      },
    };

    if ((meta as any).auth) {
      op.security = SEC_SCHEME;
    }

    if ((meta as any).description) {
      op.description = (meta as any).description;
    }

    const reqSchema = (meta as any).requestSchema;
    if (reqSchema) {
      const contentType = (meta as any).contentType || 'application/json';
      op.requestBody = {
        required: true,
        content: {
          [contentType]: {
            schema: resolveRef(reqSchema),
          },
        },
      };
      op.responses!['400'] = { $ref: '#/components/responses/ValidationError' };
    }

    const pParams = pathParamsFromKey(path);
    if (pParams.length > 0) {
      op.parameters = pParams;
    }

    if ((meta as any).responseType) {
      (op.responses!['200'] as any) = {
        description: 'OK',
        content: { [(meta as any).responseType]: { schema: { type: 'string', format: 'binary' } } },
      };
    }

    paths[normPath]![method] = op;
  }

  // Remove non-applicable error responses for public endpoints
  for (const [pathKey, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods as Record<string, Record<string, unknown>>)) {
      if (!op.security) {
        delete op.responses!['401'];
        delete op.responses!['403'];
      }
    }
  }

  // ── Build full spec ──────────────────────────────────────────────
  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'Fury App API',
      version: '1.0.0',
      description:
        'API da plataforma Fury — gestão de campanhas Meta Ads, métricas, studio criativo, ' +
        'automação, planejador, billing e administração multi-tenant.\n\n' +
        '**Autenticação**: Bearer Token (JWT) obtido em `POST /api/auth/login`.',
      contact: {
        name: 'Fury Team',
        email: 'diogommtdes@gmail.com',
      },
    },
    servers: [{ url: '/', description: 'Relativo (usa o host do deploy)' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT obtido em POST /api/auth/login. Enviar como `Authorization: Bearer <token>`.',
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Token ausente ou inválido',
          content: { 'application/json': { schema: resolveRef('Error') } },
        },
        ForbiddenError: {
          description: 'Usuário autenticado mas sem contexto de tenant',
          content: { 'application/json': { schema: resolveRef('Error') } },
        },
        NotFoundError: {
          description: 'Recurso não encontrado',
          content: { 'application/json': { schema: resolveRef('Error') } },
        },
        ValidationError: {
          description: 'Erro de validação (Zod)',
          content: { 'application/json': { schema: resolveRef('ValidationError') } },
        },
      },
      schemas: allSchemas,
    },
    tags: [
      { name: 'Health', description: 'Health check' },
      { name: 'Auth', description: 'Autenticação e gestão de usuário' },
      { name: 'Public', description: 'Endpoints públicos sem autenticação' },
      { name: 'Meta', description: 'Integração Meta Ads (Facebook/Instagram)' },
      { name: 'Metrics', description: 'Métricas de campanhas' },
      { name: 'Campaigns', description: 'Gestão de campanhas' },
      { name: 'Budget', description: 'Otimização de orçamento' },
      { name: 'Studio', description: 'Studio criativo (geração de criativos)' },
      { name: 'Automation', description: 'Automação e regras' },
      { name: 'Fury', description: 'Fury Engine — scores, regras e live feed' },
      { name: 'Dashboard', description: 'Dados do dashboard' },
      { name: 'Forms', description: 'Tracking de formulários' },
      { name: 'Goals', description: 'Configuração de objetivos' },
      { name: 'Billing', description: 'Assinaturas e pagamentos (Asaas)' },
      { name: 'Brand Kit', description: 'Configuração de identidade visual' },
      { name: 'Planner', description: 'Planejador de conteúdo' },
      { name: 'OpenRouter', description: 'Geração de IA via OpenRouter' },
      { name: 'Observability', description: 'KPIs de observabilidade' },
      { name: 'Superadmin', description: 'Administração multi-tenant (superadmin)' },
      { name: 'Instagram', description: 'Integração Instagram' },
    ],
    paths,
  };

  // ── Write ────────────────────────────────────────────────────────
  const outDir = join(dirname(import.meta.url.replace('file://', '')), '..');
  const outPath = join(outDir, 'swagger.json');
  writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n');
  console.log(`✅ swagger.json generated — ${Object.keys(paths).length} paths → ${outPath}`);
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
