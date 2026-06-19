import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MacroBenchmarkResult } from "@/lib/ai-model-benchmark";

const mocked = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  runMacroBenchmark: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentAppUser: mocked.getCurrentAppUser,
}));

vi.mock("@macro-tracker/db", () => ({
  canAccessAdmin: (role: string) => role === "admin" || role === "owner",
}));

vi.mock("@/lib/ai-model-benchmark", () => ({
  BENCHMARK_MODEL_CALL_TIMEOUT_MS: 20_000,
  BENCHMARK_ROUTE_RUNTIME_BUDGET_MS: 270_000,
  runMacroBenchmark: mocked.runMacroBenchmark,
}));

import { POST } from "@/app/api/admin/ai-model-benchmark/route";

const benchmarkResult: MacroBenchmarkResult = {
  currentModel: "current/free",
  candidateModel: "candidate/free",
  fixtureCount: 0,
  totalFixtureCount: 0,
  comparedSameModel: false,
  mode: "compare",
  usedBaseline: false,
  baselineCreatedAt: null,
  fixtures: [],
  cases: [],
  summaries: {
    current: {
      model: "current/free",
      completedCases: 0,
      failedCases: 0,
      skippedCases: 0,
      averageLatencyMs: null,
      averageErrorPct: null,
      reliabilityPct: 0,
      failureBreakdown: {
        missing_api_key: 0,
        invalid_image: 0,
        provider_rate_limit: 0,
        provider_quota: 0,
        provider_image_access: 0,
        provider_error: 0,
        empty_response: 0,
        invalid_json: 0,
        unsupported_model: 0,
        unknown: 0,
        skipped: 0,
      },
      categoryAverages: {
        fruit: null,
        protein: null,
        grain: null,
        vegetable: null,
        dairy: null,
        fat: null,
        legume: null,
      },
    },
    candidate: {
      model: "candidate/free",
      completedCases: 0,
      failedCases: 0,
      skippedCases: 0,
      averageLatencyMs: null,
      averageErrorPct: null,
      reliabilityPct: 0,
      failureBreakdown: {
        missing_api_key: 0,
        invalid_image: 0,
        provider_rate_limit: 0,
        provider_quota: 0,
        provider_image_access: 0,
        provider_error: 0,
        empty_response: 0,
        invalid_json: 0,
        unsupported_model: 0,
        unknown: 0,
        skipped: 0,
      },
      categoryAverages: {
        fruit: null,
        protein: null,
        grain: null,
        vegetable: null,
        dairy: null,
        fat: null,
        legume: null,
      },
    },
  },
};

function benchmarkRequest(body?: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/ai-model-benchmark", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fixtureLimit: 4,
      mode: "compare",
      model: "candidate/free",
      ...body,
    }),
  });
}

describe("POST /api/admin/ai-model-benchmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getCurrentAppUser.mockResolvedValue({
      id: "admin-1",
      role: "admin",
    });
    mocked.runMacroBenchmark.mockResolvedValue(benchmarkResult);
  });

  it("passes bounded runtime settings to the benchmark runner", async () => {
    const response = await POST(benchmarkRequest({ fixtureLimit: 18 }));

    expect(response.status).toBe(200);
    expect(mocked.runMacroBenchmark).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateModel: "candidate/free",
        fixtureLimit: 18,
        modelCallTimeoutMs: 20_000,
        runtimeBudgetMs: 270_000,
        userId: "admin-1",
      }),
    );
  });

  it("rejects a concurrent benchmark run with 409", async () => {
    let finishRun: (value: MacroBenchmarkResult) => void = () => undefined;
    const pendingRun = new Promise<MacroBenchmarkResult>((resolve) => {
      finishRun = resolve;
    });
    mocked.runMacroBenchmark.mockReturnValueOnce(pendingRun);

    const firstResponsePromise = POST(benchmarkRequest());
    await vi.waitFor(() => {
      expect(mocked.runMacroBenchmark).toHaveBeenCalledTimes(1);
    });

    const secondResponse = await POST(benchmarkRequest());
    const secondPayload = await secondResponse.json();

    expect(secondResponse.status).toBe(409);
    expect(secondPayload).toEqual({
      ok: false,
      error: "A benchmark run is already in progress. Try again shortly.",
    });

    finishRun(benchmarkResult);
    const firstResponse = await firstResponsePromise;
    expect(firstResponse.status).toBe(200);
  });
});
