import { canAccessAdmin } from "@macro-tracker/db";

import { getCurrentAppUser } from "@/lib/auth";
import { runMacroBenchmark } from "@/lib/ai-model-benchmark";

export const maxDuration = 300;

function parseModelName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const model = value.trim();
  if (!model || model.length > 160) {
    return null;
  }

  if (!/^[a-zA-Z0-9._:/-]+$/.test(model)) {
    return null;
  }

  return model;
}

export async function POST(request: Request) {
  const adminUser = await getCurrentAppUser();

  if (!adminUser) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  if (!canAccessAdmin(adminUser.role)) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const payload = (await request.json().catch(() => null)) as {
    fixtureLimit?: unknown;
    model?: unknown;
  } | null;
  const candidateModel = parseModelName(payload?.model);
  const fixtureLimit =
    typeof payload?.fixtureLimit === "number" &&
    Number.isInteger(payload.fixtureLimit)
      ? payload.fixtureLimit
      : undefined;

  if (!candidateModel) {
    return Response.json(
      {
        ok: false,
        error:
          "Enter an OpenRouter model id, for example google/gemma-4-31b-it:free.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runMacroBenchmark({
      candidateModel,
      fixtureLimit,
      userId: adminUser.id,
    });

    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Benchmark run failed.",
      },
      { status: 500 },
    );
  }
}
