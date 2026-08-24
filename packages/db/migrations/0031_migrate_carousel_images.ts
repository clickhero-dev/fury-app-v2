import postgres from 'postgres';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envFile = path.join(__dirname, '../.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_test'
    : process.env.DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_dev';

async function migrateCarouselImages() {
  const sql = postgres(connectionString, { max: 1 });

  try {
    console.log('Iniciando migração: converter imageUrl para imageUrls em carrosséis...');

    // Busca posts do tipo carousel que têm imageUrl mas não têm imageUrls
    const carouselPosts = await sql`
      SELECT id, "imageUrl" FROM "socialPosts"
      WHERE "postType" = 'carousel'
        AND "imageUrl" IS NOT NULL
        AND "imageUrl" != ''
        AND ("imageUrls" IS NULL OR "imageUrls" = '[]'::jsonb OR jsonb_typeof("imageUrls") != 'array')
    `;

    console.log(`Encontrados ${carouselPosts.length} posts de carrossel para migrar`);

    for (const post of carouselPosts) {
      const imageUrls = [post.imageUrl];
      await sql`
        UPDATE "socialPosts"
        SET "imageUrls" = ${JSON.stringify(imageUrls)}::jsonb
        WHERE id = ${post.id}
      `;
      console.log(`  ✓ Migrado post ${post.id}`);
    }

    console.log('Migração concluída com sucesso!');
  } catch (err) {
    console.error('Erro na migração:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

import fs from 'fs';

migrateCarouselImages().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});