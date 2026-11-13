/** Test-only HTTP composition: real auth/routes/service/repository, simulated private storage. */
import express from 'express';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { ChatAttachmentRepository } from '../repository/chat-attachment.repository.js';
import { ChatAttachmentService } from '../services/chat/chat-attachment.service.js';
import { ChatMediaController } from '../controllers/chat-media.controller.js';
import { createChatMediaRouter } from '../routes/chat-media.routes.js';
import { createDelegationGuard } from '../middleware/chat-delegation.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { errorHandler } from '../middleware/errorHandler.js';

const url = process.env.CHAT_MEDIA_TEST_DATABASE_URL!;
const schema = process.env.CHAT_DELETION_TEST_SCHEMA!;
const parsed = new URL(url);
if (process.env.NODE_ENV !== 'test' || parsed.hostname !== '127.0.0.1' ||
    !parsed.pathname.endsWith('_isolated') || !/^chat_media_[a-f0-9]{32}$/.test(schema)) {
  throw new Error('Explicit disposable localhost database and test schema required');
}
const client = postgres(url, { max: 4, debug: (_connection, query) => console.log('SQL:', query), onnotice: () => undefined, connection: { search_path: schema } });
const database = drizzle(client) as never;
const deletes: Array<{ key: string; attachments: number; messages: number }> = [];
const storage = {
  async put() { throw new Error('unused'); },
  async get(): Promise<Buffer> { throw new Error('unused'); },
  async delete(key: string) {
    const [row] = await client`SELECT (SELECT count(*)::int FROM chat_attachments) AS attachments,
      (SELECT count(*)::int FROM chat_messages) AS messages`;
    deletes.push({ key, attachments: row.attachments, messages: row.messages });
    if (key.startsWith('fail-')) throw new Error('simulated storage outage');
  },
};
const service = new ChatAttachmentService((tenant, user) => new ChatAttachmentRepository(tenant, user, database), storage, {} as never, {} as never);
const app = express();
app.use(express.json());
app.get('/__test/state', (_req, res) => res.json({ deletes }));
app.use(createDelegationGuard({ secret: process.env.CHAT_DELEGATION_SECRET!, repository: () => { throw new Error('No business approval expected'); } }));
app.use('/api/chat', authMiddleware, createChatMediaRouter(new ChatMediaController({} as never, service)));
app.use(errorHandler);
const server = app.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(JSON.stringify({ port: address.port }));
});
async function close() { server.closeAllConnections(); server.close(); await client.end(); process.exit(0); }
process.once('SIGTERM', () => { void close(); });
