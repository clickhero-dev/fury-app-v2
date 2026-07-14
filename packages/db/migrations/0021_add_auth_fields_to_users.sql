ALTER TABLE "users" ADD COLUMN "otp_code" varchar(6);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "otp_expires_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_token" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_token_expires_at" timestamptz;
