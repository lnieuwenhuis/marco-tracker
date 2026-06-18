import { describe, expect, it, vi } from "vitest";

import {
  MACRO_BENCHMARK_FIXTURES,
  calculateMacroBenchmarkError,
  runMacroBenchmark,
  validateBenchmarkBaseline,
  type MacroBenchmarkModelCaseResult,
} from "@/lib/ai-model-benchmark";

function readyEstimate(label: string) {
  return {
    ok: true as const,
    analysis: {
      status: "ready" as const,
      question: null,
      estimate: {
        label,
        caloriesKcal: 105,
        proteinG: 1.3,
        carbsG: 27,
        fatG: 0.4,
        confidence: 0.9,
        notes: [],
      },
    },
  };
}

describe("calculateMacroBenchmarkError", () => {
  it("computes absolute macro errors and normalized average error", () => {
    expect(
      calculateMacroBenchmarkError(
        {
          caloriesKcal: 125,
          proteinG: 3.3,
          carbsG: 22,
          fatG: 2.4,
        },
        {
          caloriesKcal: 105,
          proteinG: 1.3,
          carbsG: 27,
          fatG: 0.4,
        },
      ),
    ).toEqual({
      absoluteError: {
        caloriesKcal: 20,
        proteinG: 2,
        carbsG: 5,
        fatG: 2,
      },
      normalizedErrorPct: 29.4,
    });
  });

  it("keeps a broad fixture set with local image and macro metadata", () => {
    expect(MACRO_BENCHMARK_FIXTURES).toHaveLength(18);
    expect(
      MACRO_BENCHMARK_FIXTURES.every(
        (fixture) =>
          fixture.assetFileName.endsWith(".jpg") &&
          fixture.thumbnailUrl === `/benchmark-foods/${fixture.assetFileName}` &&
          fixture.imageSourceUrl.startsWith("https://") &&
          fixture.expectedSource.length > 0 &&
          fixture.expected.caloriesKcal > 0 &&
          fixture.category.length > 0,
      ),
    ).toBe(true);
  });

  it("deduplicates calls when candidate model equals current model", async () => {
    const analyzeFoodPhotoImpl = vi.fn(async () => readyEstimate("banana"));

    const result = await runMacroBenchmark({
      analyzeFoodPhotoImpl,
      candidateModel: "current/free",
      currentModel: "current/free",
      fixtureLimit: 4,
      requestDelayMs: 0,
      retryDelayMs: 0,
      userId: "test-user",
    });

    expect(result.comparedSameModel).toBe(true);
    expect(analyzeFoodPhotoImpl).toHaveBeenCalledTimes(4);
    expect(result.cases.every((item) => item.current === item.candidate)).toBe(
      true,
    );
  });

  it("supports candidate-only mode without current model calls", async () => {
    const analyzeFoodPhotoImpl = vi.fn(async () => readyEstimate("candidate"));

    const result = await runMacroBenchmark({
      analyzeFoodPhotoImpl,
      candidateModel: "candidate/free",
      currentModel: "current/free",
      fixtureLimit: 4,
      mode: "candidate_only",
      requestDelayMs: 0,
      retryDelayMs: 0,
      userId: "test-user",
    });

    expect(result.summaries.current).toBeNull();
    expect(result.summaries.candidate.completedCases).toBe(4);
    expect(analyzeFoodPhotoImpl).toHaveBeenCalledTimes(4);
  });

  it("reuses a valid baseline for current model results", async () => {
    const baselineResult: MacroBenchmarkModelCaseResult = {
      model: "current/free",
      ok: true,
      latencyMs: 123,
      estimate: readyEstimate("baseline").analysis.estimate,
      absoluteError: {
        caloriesKcal: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
      },
      normalizedErrorPct: 0,
      error: null,
    };
    const analyzeFoodPhotoImpl = vi.fn(async () => readyEstimate("candidate"));
    const fixtureIds = MACRO_BENCHMARK_FIXTURES.slice(0, 4).map(
      (fixture) => fixture.id,
    );

    const result = await runMacroBenchmark({
      analyzeFoodPhotoImpl,
      baseline: {
        currentModel: "current/free",
        createdAt: new Date().toISOString(),
        fixtureIds,
        results: fixtureIds.map(() => baselineResult),
      },
      candidateModel: "candidate/free",
      currentModel: "current/free",
      fixtureLimit: 4,
      requestDelayMs: 0,
      retryDelayMs: 0,
      userId: "test-user",
    });

    expect(result.usedBaseline).toBe(true);
    expect(result.summaries.current?.completedCases).toBe(4);
    expect(result.summaries.candidate.completedCases).toBe(4);
    expect(analyzeFoodPhotoImpl).toHaveBeenCalledTimes(4);
  });

  it("skips remaining model calls after a rate-limit failure", async () => {
    const analyzeFoodPhotoImpl = vi
      .fn()
      .mockResolvedValueOnce(readyEstimate("current"))
      .mockResolvedValueOnce(readyEstimate("candidate"))
      .mockResolvedValueOnce(readyEstimate("current"))
      .mockResolvedValueOnce({
        ok: false,
        error: "Rate limit exceeded: free-models-per-min",
        kind: "provider_rate_limit",
        retryable: true,
      })
      .mockResolvedValueOnce({
        ok: false,
        error: "Rate limit exceeded: free-models-per-min",
        kind: "provider_rate_limit",
        retryable: true,
      })
      .mockResolvedValue(readyEstimate("current"));

    const result = await runMacroBenchmark({
      analyzeFoodPhotoImpl,
      candidateModel: "candidate/free",
      currentModel: "current/free",
      fixtureLimit: 4,
      requestDelayMs: 0,
      retryDelayMs: 0,
      userId: "test-user",
    });

    expect(result.cases[1]?.candidate.failureKind).toBe("provider_rate_limit");
    expect(result.cases[2]?.candidate.wasSkipped).toBe(true);
    expect(result.cases[2]?.candidate.latencyMs).toBeNull();
  });

  it("rejects stale or mismatched baselines", () => {
    const fixtures = MACRO_BENCHMARK_FIXTURES.slice(0, 4);

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "other/free",
          createdAt: new Date().toISOString(),
          fixtureIds: fixtures.map((fixture) => fixture.id),
          results: [],
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();
  });
});
