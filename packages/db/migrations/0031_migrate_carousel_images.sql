-- Migração: adiciona coluna image_urls (carrossel multi-imagem) e
-- backfill dos carrosséis existentes a partir de image_url (imagem única).
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "image_urls" jsonb DEFAULT '[]'::jsonb;

UPDATE "social_posts"
SET "image_urls" = jsonb_build_array("image_url")
WHERE "post_type" = 'carousel'
  AND "image_url" IS NOT NULL
  AND "image_url" != ''
  AND ("image_urls" IS NULL OR "image_urls" = '[]'::jsonb OR jsonb_typeof("image_urls") != 'array');
