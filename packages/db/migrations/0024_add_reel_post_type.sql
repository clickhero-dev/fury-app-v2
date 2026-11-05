DO $$ BEGIN
  ALTER TYPE "post_type" ADD VALUE IF NOT EXISTS 'reel';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
