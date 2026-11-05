CREATE TYPE "faq_status" AS ENUM ('draft', 'published');

CREATE TABLE "faqs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "markdown" text NOT NULL,
  "status" "faq_status" DEFAULT 'draft' NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "faqs_slug_idx" ON "faqs" USING btree ("slug");
CREATE INDEX "faqs_status_idx" ON "faqs" USING btree ("status");

CREATE TABLE "faq_slug_redirects" (
  "slug" varchar(255) PRIMARY KEY NOT NULL,
  "faq_id" uuid NOT NULL REFERENCES "faqs"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "faq_slug_redirects_faq_id_idx" ON "faq_slug_redirects" USING btree ("faq_id");
