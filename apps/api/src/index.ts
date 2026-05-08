import 'dotenv/config.js';
/// <reference path="./types/express.d.ts" />
import 'dotenv/config';
import express from 'express';
import { loggerMiddleware } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { initWorkers, shutdownWorkers } from './workers/index.js';
import { closeRedis } from './lib/redis.js';
import { startSyncJobsWorker, stopSyncJobsWorker } from './lib/sync-jobs.js';

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(loggerMiddleware);

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', routes);

// Error handling
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

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${NODE_ENV}`);

  initWorkers().catch((err) => {
    console.error('[workers] failed to start:', (err as Error).message);
  });
  if (NODE_ENV !== 'test') {
    void startSyncJobsWorker().catch((error) => {
      console.error('Failed to start Meta sync worker:', error);
    });
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    await stopSyncJobsWorker();
    await closeRedis();
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(async () => {
    await shutdownWorkers().catch(() => undefined);
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
