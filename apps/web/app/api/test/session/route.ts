import {
  completeUserOnboarding,
  ensureUserRole,
  getDb,
  upsertUserFromShooProfile,
} from "@macro-tracker/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { applySessionCookie, isSecureRequest } from "@/lib/session";

const TEST_ROUTE_SECRET_HEADER = "x-test-route-secret";
const TEST_LOGIN_BASES = new Set(["coach", "owner", "admin", "user", "setup"]);

function getTestLoginBase(email: string) {
  const match = /^([a-z]+)(?:\+[a-z0-9-]+)?@example\.com$/i.exec(email);
  const base = match?.[1]?.toLowerCase();

  return base && TEST_LOGIN_BASES.has(base) ? base : null;
}

function hasValidTestRouteSecret(
  request: Request,
  testRoutesSecret: string | undefined,
) {
  return Boolean(
    testRoutesSecret &&
      request.headers.get(TEST_ROUTE_SECRET_HEADER) === testRoutesSecret,
  );
}

async function ensureTestSchema() {
  const db = await getDb();

  await db.execute(sql.raw(`
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
  `));
  await db.execute(
    sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "users_shoo_pairwise_sub_key" ON "users" USING btree ("shoo_pairwise_sub")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users" USING btree ("email")`,
    ),
  );
  await db.execute(
    sql.raw(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL`,
    ),
  );
  await db.execute(sql.raw(`
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
  `));
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "meal_entries_user_date_idx" ON "meal_entries" USING btree ("user_id","entry_date")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "meal_entries_user_date_sort_idx" ON "meal_entries" USING btree ("user_id","entry_date","sort_order")`,
    ),
  );

  return db;
}

async function createTestSessionResponse(
  email: string | undefined,
  request: Request,
  options: {
    redirectOnSuccess: boolean;
    onboarded: boolean;
  },
) {
  if (!email) {
    return NextResponse.json(
      { error: "Email is required." },
      { status: 400 },
    );
  }

  const testLoginBase = getTestLoginBase(email);

  if (!testLoginBase) {
    return NextResponse.json(
      { error: "This test login is not allowlisted." },
      { status: 403 },
    );
  }

  const db = await ensureTestSchema();
  const user = await upsertUserFromShooProfile(
    {
      pairwiseSub: `test:${email}`,
      email,
      displayName: "Playwright User",
      pictureUrl: null,
    },
    db,
  );
  if (testLoginBase === "owner") {
    await ensureUserRole(user.id, "owner", db);
  }
  if (options.onboarded) {
    await completeUserOnboarding(user.id, { preferredWeightUnit: "kg" }, db);
  } else {
    await db.execute(sql`
      UPDATE "users"
      SET "onboarding_completed_at" = NULL
      WHERE "id" = ${user.id}
    `);
  }
  const response = options.redirectOnSuccess
    ? NextResponse.redirect(new URL("/", request.url))
    : NextResponse.json({
        ok: true,
        user: {
          userId: user.id,
          email: user.email,
        },
      });

  await applySessionCookie(
    response,
    {
      userId: user.id,
      email: user.email,
    },
    {
      secure: isSecureRequest(request),
    },
  );

  return response;
}

export async function GET(request: Request) {
  const env = getServerEnv();

  if (!env.enableTestRoutes) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!hasValidTestRouteSecret(request, env.testRoutesSecret)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  const onboarded = url.searchParams.get("onboarded") !== "false";

  return createTestSessionResponse(email, request, {
    redirectOnSuccess: true,
    onboarded,
  });
}

export async function POST(request: Request) {
  const env = getServerEnv();

  if (!env.enableTestRoutes) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!hasValidTestRouteSecret(request, env.testRoutesSecret)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json()) as { email?: string; onboarded?: boolean };
  const email = body.email?.trim().toLowerCase();

  return createTestSessionResponse(email, request, {
    redirectOnSuccess: false,
    onboarded: body.onboarded !== false,
  });
}
