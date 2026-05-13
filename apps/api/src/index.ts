/// <reference path="./types/express.d.ts" />
import 'dotenv/config';
import express from 'express';
import { loggerMiddleware } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { closeRedis } from './lib/redis.js';
import { closeComplianceQueue, closeStudioQueue } from './lib/queue.js';
import { startSyncJobsWorker, stopSyncJobsWorker } from './lib/sync-jobs.js';
import { startRuleEngine, stopRuleEngine } from './lib/rule-engine-manager.js';
import { ensureStudioAssetsDir, studioAssetsDir } from './lib/temp-storage.js';
import { startStudioGenerationWorker, stopStudioGenerationWorker } from './workers/studio-generation.worker.js';

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(loggerMiddleware);
app.use('/studio-assets', express.static(studioAssetsDir));

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

let server: any = null;

if (NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📝 Environment: ${NODE_ENV}`);
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
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(async () => {
      await stopSyncJobsWorker();
      await stopStudioGenerationWorker();
      await closeStudioQueue();
      await closeComplianceQueue();
      await closeRedis();
      console.log('Server closed');
      process.exit(0);
    });
  });
}

export default app;
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    await stopSyncJobsWorker();
    await stopRuleEngine();
    await stopStudioGenerationWorker();
    await closeStudioQueue();
    await closeComplianceQueue();
    await closeRedis();
    console.log('Server closed');
    process.exit(0);
  });
});
