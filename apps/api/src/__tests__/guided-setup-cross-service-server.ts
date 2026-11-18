/** Disposable cross-service API: real Node HTTP, JWT delegation and PostgreSQL. */
import express from 'express';
import postgres from 'postgres';
import { verifyChatDelegation } from '../lib/chat-delegation.js';

const url = process.env.CHAT_MEDIA_TEST_DATABASE_URL!;
const schema = process.env.CHAT_CROSS_SERVICE_SCHEMA!;
const secret = process.env.CHAT_DELEGATION_SECRET!;
if (new URL(url).hostname !== '127.0.0.1' || !/^chat_media_[a-f0-9]{32}$/.test(schema)) throw new Error('isolated fixture required');
const sql = postgres(url, { connection: { search_path: schema }, onnotice: () => undefined });
const app = express(); app.use(express.json());
function identity(req: express.Request) {
  const token = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
  return verifyChatDelegation(token, secret);
}
app.post('/api/studio/ai/generate-image', async (req, res) => {
  const who = identity(req); if (req.body.save_as_logo !== true) return res.sendStatus(400);
  const logo = 'https://fixture.invalid/generated-logo.png';
  await sql`INSERT INTO brand_kits(tenant_id,logo_url,primary_color,secondary_color)
    VALUES(${who.tenantId}::uuid,${logo},'#D1141D','#123CB5')
    ON CONFLICT(tenant_id) DO UPDATE SET logo_url=EXCLUDED.logo_url,primary_color=coalesce(brand_kits.primary_color,EXCLUDED.primary_color),secondary_color=coalesce(brand_kits.secondary_color,EXCLUDED.secondary_color)`;
  res.json({ success: true, data: { imageUrl: logo, logo: { saved: true, colors: { primaryColor: '#D1141D', secondaryColor: '#123CB5' } } } });
});
app.post('/api/chat/conversations/:conversation/attachments/:attachment/promote', async (req, res) => {
  const who = identity(req);
  const [attachment] = await sql`SELECT id FROM chat_attachments WHERE id=${req.params.attachment}::uuid AND tenant_id=${who.tenantId}::uuid AND user_id=${who.userId}::uuid AND conversation_id=${req.params.conversation}::uuid`;
  if (!attachment) return res.sendStatus(404);
  if (req.body.target !== 'library' || !['empresa','equipe','produto'].includes(req.body.kind)) return res.sendStatus(400);
  const [kit] = await sql`INSERT INTO brand_kits(tenant_id) VALUES(${who.tenantId}::uuid) ON CONFLICT(tenant_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id RETURNING id`;
  const [photo] = await sql`INSERT INTO brand_kit_photos(tenant_id,brand_kit_id,kind,url) VALUES(${who.tenantId}::uuid,${kit.id},${req.body.kind},'https://fixture.invalid/private-copy.png') RETURNING id,kind`;
  res.status(201).json({ success: true, data: { kind: 'library', photos: [photo] } });
});
app.post('/api/auth/me/chat-guided-update', async (req, res) => {
  const who = identity(req);
  await sql`UPDATE tenants SET name=${req.body.tenantName},business_context=${req.body.businessContext} WHERE id=${who.tenantId}::uuid`;
  res.json({ success: true, data: { tenantName: req.body.tenantName, businessContext: req.body.businessContext } });
});
const server = app.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ port: (server.address() as any).port })));
process.once('SIGTERM', async () => { server.close(); await sql.end(); process.exit(0); });
