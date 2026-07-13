/// <reference path="./types/express.d.ts" />
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { loggerMiddleware } from './middleware/logger.js';
import { requestLogger, flushRequestLogs } from './middleware/request-logger.js';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { closeRedis, waitForRedisReady } from './lib/redis.js';
import { closeComplianceQueue, closeStudioQueue, closeRedisConnection, closeFuryEngineQueue } from './lib/queue.js';
import { startSyncJobsWorker, stopSyncJobsWorker } from './lib/sync-jobs.js';
import { startRuleEngine, stopRuleEngine } from './lib/rule-engine-manager.js';
import { startFuryEngine, stopFuryEngine } from './lib/fury-engine-manager.js';
import { ensureStudioAssetsDir, studioAssetsDir } from './lib/temp-storage.js';
import { startStudioGenerationWorker, stopStudioGenerationWorker } from './workers/studio-generation.worker.js';
import { startComplianceCheckWorker, stopComplianceCheckWorker } from './workers/compliance-check.worker.js';
import { startBudgetOptimizerWorker, stopBudgetOptimizerWorker } from './workers/budget-optimizer.worker.js';
import { seedStartup } from './lib/seed-superadmin.js';

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Necessário para req.ip refletir o IP real atrás de proxy reverso (nginx, load balancer)
app.set('trust proxy', 1);

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => callback(null, true),
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(loggerMiddleware);
app.use(requestLogger);
console.log('=== STATIC serving /studio-assets from:', studioAssetsDir);
app.use('/studio-assets', express.static(studioAssetsDir));

// Public LP (landing page) for WhatsApp Conversation campaigns — no auth
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTenantId(slugOrId: string): Promise<string | null> {
  const { db, tenants } = await import('@fury/db');
  const { eq } = await import('drizzle-orm');
  const column = UUID_RE.test(slugOrId) ? tenants.id : tenants.slug;
  const tenant = await db.query.tenants.findFirst({ where: eq(column, slugOrId) });
  return tenant?.id ?? null;
}

app.get('/api/lp/:slug', async (req, res) => {
  try {
    const { db, brandKits } = await import('@fury/db');
    const { eq } = await import('drizzle-orm');

    const tenantId = await resolveTenantId(req.params.slug);
    if (!tenantId) {
      res.status(404).send('Página não encontrada');
      return;
    }

    const bk = await db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, tenantId) });
    const waNum = bk?.whatsappNumber as string | null;
    const primary = bk?.primaryColor || '#E8631A';
    const secondary = bk?.secondaryColor || '#f5f5f5';
    const logoHtml = bk?.logoUrl
      ? `<img src="${bk.logoUrl}" alt="Logo" class="logo" />`
      : '';

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Fale Conosco</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:${secondary};padding:20px}
.card{text-align:center;max-width:420px;width:100%;padding:40px 24px}
.logo{max-width:140px;max-height:80px;margin-bottom:24px;object-fit:contain}
h1{font-size:24px;color:${primary};margin-bottom:12px}
p{font-size:16px;color:#666;margin-bottom:32px;line-height:1.5}
.btn{display:inline-flex;align-items:center;gap:8px;background:${primary};color:#fff;padding:16px 32px;border-radius:50px;font-size:18px;font-weight:600;text-decoration:none;transition:opacity .2s}
.btn:hover{opacity:.9}
svg{width:24px;height:24px;fill:currentColor}
</style>
</head>
<body>
<div class="card">
${logoHtml}
<h1>Fale Conosco</h1>
<p>Clique no botão abaixo para conversar conosco pelo WhatsApp.</p>
<a class="btn" href="https://wa.me/${waNum || ''}" target="_blank" rel="noopener">
<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
Converse Comigo
</a>
</div>
</body>
</html>`);
  } catch (e) {
    console.error('[LP] erro:', e);
    res.status(500).send('Erro interno');
  }
});

// Public JSON endpoint for frontend LP — no auth
app.get('/api/public/brand-kit/:slug', async (req, res) => {
  try {
    const { db, brandKits, tenants } = await import('@fury/db');
    const { eq } = await import('drizzle-orm');

    const tenantId = await resolveTenantId(req.params.slug);
    if (!tenantId) {
      return res.status(404).json({ success: false, message: 'Tenant não encontrado' });
    }

    // Fetch tenant name and brand kit in parallel
    const [tenant, bk] = await Promise.all([
      db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) }),
      db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, tenantId) }),
    ]);

    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant não encontrado' });
    }

    res.json({
      success: true,
      data: {
        tenantName: tenant.name,
        logo_url: bk?.logoUrl ?? null,
        whatsapp_number: bk?.whatsappNumber as string | null,
        primary_color: bk?.primaryColor ?? '#E8631A',
        secondary_color: bk?.secondaryColor ?? '#f5f5f5',
      },
    });
  } catch (e) {
    console.error('[LP-API] erro:', e);
    res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

app.use('/api', rateLimitMiddleware);
app.use('/api', routes);
app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
    timestamp: new Date().toISOString(),
  });
});

// Tudo que precisa de await fica dentro da IIFE
(async () => {
  if (NODE_ENV !== 'test') {
    // 🚀 Run seed: ensures superadmin + demo users exist before accepting requests
    await seedStartup();

    // Aguarda o Redis estar pronto antes de iniciar qualquer worker
    await waitForRedisReady();

    const server = app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📝 Environment: ${NODE_ENV}`);

      // Aumenta o timeout do servidor HTTP para 60s, evitando que o proxy
      // (Traefik) retorne 502 antes do Node.js completar requisições longas.
      server.timeout = 60_000;
      server.keepAliveTimeout = 65_000;
      server.headersTimeout = 66_000;

      // Debug: print all registered routes
      const printRoutes = (stack: any[], prefix = '') => {
        for (const layer of stack) {
          if (layer.route) {
            const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
            console.log(`  ${methods.padEnd(8)} ${prefix}${layer.route.path}`);
          } else if (layer.handle?.stack) {
            const m = layer.regexp?.source?.match(/^\^\\\/([^\\?$]+)/);
            const seg = m ? `/${m[1].replace(/\\\//g, '/')}` : '';
            printRoutes(layer.handle.stack, prefix + seg);
          }
        }
      };
      console.log('📋 Registered routes:');
      printRoutes((app as any)._router.stack);
      
      void ensureStudioAssetsDir().catch((error) => {
        console.error('Failed to prepare studio assets dir:', error);
      });
      void startSyncJobsWorker().catch((error) => {
        console.error('Failed to start Meta sync worker:', error);
      });
      void startRuleEngine().catch((error) => {
        console.error('Failed to start rule engine:', error);
      });
      void startStudioGenerationWorker().catch((error) => {
        console.error('Failed to start Studio generation worker:', error);
      });
      void startComplianceCheckWorker().catch((error) => {
        console.error('Failed to start Compliance check worker:', error);
      });
      void startBudgetOptimizerWorker().catch((error) => {
        console.error('Failed to start Budget optimizer worker:', error);
      });
      void startFuryEngine().catch((error) => {
        console.error('Failed to start Fury engine:', error);
      });
    });

    // Tratamento de encerramento (único handler)
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      server.close(async () => {
        await flushRequestLogs();
        await stopSyncJobsWorker();
        await stopRuleEngine();
        await stopStudioGenerationWorker();
        await stopComplianceCheckWorker();
        await stopBudgetOptimizerWorker();
        await stopFuryEngine();
        await closeStudioQueue();
        await closeComplianceQueue();
        await closeFuryEngineQueue();
        await closeRedisConnection();
        await closeRedis();
        console.log('Server closed');
        process.exit(0);
      });
    });
  }
})();

export default app; 
