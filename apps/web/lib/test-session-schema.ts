import { getDb } from "@macro-tracker/db";
import { sql } from "drizzle-orm";

const TEST_SESSION_SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS "users" (
      "id" uuid PRIMARY KEY NOT NULL,
      "shoo_pairwise_sub" text NOT NULL,
      "email" text NOT NULL,
      "display_name" text,
      "picture_url" text,
      "role" text DEFAULT 'user' NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "last_login_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `,
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_shoo_pairwise_sub_key" ON "users" USING btree ("shoo_pairwise_sub")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users" USING btree ("email")`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL`,
  `
    CREATE TABLE IF NOT EXISTS "meal_entries" (
      "id" uuid PRIMARY KEY NOT NULL,
      "user_id" uuid NOT NULL,
      "entry_date" date NOT NULL,
      "label" text NOT NULL,
      "sort_order" integer NOT NULL,
      "protein_g" numeric(6, 1) NOT NULL,
      "carbs_g" numeric(6, 1) NOT NULL,
      "fat_g" numeric(6, 1) NOT NULL,
      "calories_kcal" integer NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `,
  `CREATE INDEX IF NOT EXISTS "meal_entries_user_date_idx" ON "meal_entries" USING btree ("user_id","entry_date")`,
  `CREATE INDEX IF NOT EXISTS "meal_entries_user_date_sort_idx" ON "meal_entries" USING btree ("user_id","entry_date","sort_order")`,
];

export async function ensureTestSessionSchema() {
  const db = await getDb();

  for (const statement of TEST_SESSION_SCHEMA_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }

  return db;
}
