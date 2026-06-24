import { createTemplate } from "@macro-tracker/db";
import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { getSessionUserFromCookies } from "@/lib/session";
import { ensureTestRouteRequest } from "@/lib/test-routes";

export async function POST(request: Request) {
  const env = getServerEnv();
  const testRouteError = ensureTestRouteRequest(request, env);

  if (testRouteError) {
    return testRouteError;
  }

  const sessionUser = await getSessionUserFromCookies();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const template = await createTemplate(sessionUser.userId, {
    type: body.type === "meal" ? "meal" : "day",
    label: String(body.label ?? ""),
    items: Array.isArray(body.items) ? body.items : [],
  });

  return NextResponse.json({ template });
}
