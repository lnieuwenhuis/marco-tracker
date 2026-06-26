CREATE TABLE "api_tokens" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "token_prefix" text NOT NULL,
  "name" text NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "api_tokens_user_created_idx" ON "api_tokens" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "api_tokens_user_revoked_idx" ON "api_tokens" USING btree ("user_id", "revoked_at");
