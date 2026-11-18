/** Disposable cross-service harness: actual delegated HTTP and actual repository. */
import express from 'express';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { ChatProfileRepository } from '../repository/chat-profile.repository.js';
import { ChatProfileService } from '../services/core/chat-profile.service.js';
import { ChatProfileController } from '../controllers/chat-profile.controller.js';
import { createDelegationGuard } from '../middleware/chat-delegation.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { errorHandler } from '../middleware/errorHandler.js';

const url = process.env.CHAT_MEDIA_TEST_DATABASE_URL ?? '';
const schema = process.env.CHAT_CROSS_SERVICE_SCHEMA ?? '';
const secret = process.env.CHAT_DELEGATION_SECRET ?? '';
const parsed = new URL(url);
if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.endsWith('_isolated') ||
    !/^(?:chat_media|chat_guided|guided_profile)_[a-f0-9]{32}$/.test(schema) || secret.length < 32) {
  throw new Error('isolated database, schema and delegation secret required');
}
const sql = postgres(url, { connection: { search_path: schema }, onnotice: () => {} });
const db = drizzle(sql);
const app = express();
app.use(express.json());
app.use(createDelegationGuard({ secret, repository: () => { throw new Error('unexpected approval'); } }));
app.post('/api/auth/me/chat-guided-update', authMiddleware, tenantMiddleware,
  new ChatProfileController(new ChatProfileService(id => new ChatProfileRepository(id, db as never))).guidedUpdate);
app.use(errorHandler);
const server = app.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ port: (server.address() as { port: number }).port })));
process.once('SIGTERM', () => { server.close(() => { void sql.end().then(() => process.exit(0)); }); });
