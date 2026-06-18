import { canAccessAdmin } from "@macro-tracker/db";

import { getCurrentAppUser } from "@/lib/auth";
import {
  runMacroBenchmark,
  type MacroBenchmarkBaseline,
  type MacroBenchmarkMode,
} from "@/lib/ai-model-benchmark";

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

function parseFixtureLimit(value: unknown) {
  return value === 4 || value === 8 || value === 12 || value === 18
    ? value
    : undefined;
}

function parseMode(value: unknown): MacroBenchmarkMode {
  return value === "candidate_only" ? "candidate_only" : "compare";
}

function parseBaseline(value: unknown): MacroBenchmarkBaseline | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.currentModel !== "string" ||
    typeof record.createdAt !== "string" ||
    !Array.isArray(record.fixtureIds) ||
    !Array.isArray(record.results) ||
    !record.fixtureIds.every((fixtureId) => typeof fixtureId === "string")
  ) {
    return undefined;
  }

  return {
    currentModel: record.currentModel,
    createdAt: record.createdAt,
    fixtureIds: record.fixtureIds,
    results: record.results as MacroBenchmarkBaseline["results"],
  };
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
    baseline?: unknown;
    fixtureLimit?: unknown;
    mode?: unknown;
    model?: unknown;
  } | null;
  const candidateModel = parseModelName(payload?.model);
  const fixtureLimit = parseFixtureLimit(payload?.fixtureLimit);
  const mode = parseMode(payload?.mode);
  const baseline = parseBaseline(payload?.baseline);

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
      baseline,
      candidateModel,
      fixtureLimit,
      mode,
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
