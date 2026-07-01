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
