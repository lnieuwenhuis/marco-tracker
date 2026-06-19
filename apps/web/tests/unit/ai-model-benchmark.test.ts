import { describe, expect, it, vi } from "vitest";

import {
  MACRO_BENCHMARK_FIXTURES,
  calculateMacroBenchmarkError,
  runMacroBenchmark,
  validateBenchmarkBaseline,
  type MacroBenchmarkModelCaseResult,
} from "@/lib/ai-model-benchmark";

type BenchmarkFixture = (typeof MACRO_BENCHMARK_FIXTURES)[number];

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

function estimateForFixture(fixture: BenchmarkFixture) {
  return {
    label: fixture.name,
    caloriesKcal: fixture.expected.caloriesKcal,
    proteinG: fixture.expected.proteinG,
    carbsG: fixture.expected.carbsG,
    fatG: fixture.expected.fatG,
    confidence: 0.9,
    notes: [],
  };
}

function successfulBaselineResult(
  fixture: BenchmarkFixture,
  model = "current/free",
): MacroBenchmarkModelCaseResult {
  const estimate = estimateForFixture(fixture);
  const error = calculateMacroBenchmarkError(estimate, fixture.expected);

  return {
    model,
    ok: true,
    latencyMs: 123,
    estimate,
    absoluteError: error.absoluteError,
    normalizedErrorPct: error.normalizedErrorPct,
    error: null,
  };
}

function failureBaselineResult(
  overrides?: Partial<MacroBenchmarkModelCaseResult>,
): MacroBenchmarkModelCaseResult {
  return {
    model: "current/free",
    ok: false,
    latencyMs: 123,
    estimate: null,
    absoluteError: null,
    normalizedErrorPct: null,
    error: "Provider failed.",
    failureKind: "unsupported_model",
    retryable: false,
    ...overrides,
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
    const analyzeFoodPhotoImpl = vi.fn(async () => readyEstimate("candidate"));
    const fixtures = MACRO_BENCHMARK_FIXTURES.slice(0, 4);
    const fixtureIds = fixtures.map((fixture) => fixture.id);

    const result = await runMacroBenchmark({
      analyzeFoodPhotoImpl,
      baseline: {
        currentModel: "current/free",
        createdAt: new Date().toISOString(),
        fixtureIds,
        results: fixtures.map((fixture) => successfulBaselineResult(fixture)),
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

  it("skips provider calls when the runtime budget cannot safely start work", async () => {
    const analyzeFoodPhotoImpl = vi.fn(async () => readyEstimate("never"));

    const result = await runMacroBenchmark({
      analyzeFoodPhotoImpl,
      candidateModel: "candidate/free",
      currentModel: "current/free",
      fixtureLimit: 4,
      requestDelayMs: 0,
      retryDelayMs: 0,
      runtimeBudgetMs: 1,
      userId: "test-user",
    });

    expect(analyzeFoodPhotoImpl).not.toHaveBeenCalled();
    expect(result.summaries.current?.skippedCases).toBe(4);
    expect(result.summaries.candidate.skippedCases).toBe(4);
    expect(
      result.cases.every(
        (item) => item.current.wasSkipped && item.candidate.wasSkipped,
      ),
    ).toBe(true);
  });

  it("turns unexpected provider exceptions into per-case failures", async () => {
    const analyzeFoodPhotoImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("transport exploded"))
      .mockResolvedValue(readyEstimate("candidate"));

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

    expect(result.cases[0]?.candidate).toEqual(
      expect.objectContaining({
        ok: false,
        error: "transport exploded",
        failureKind: "provider_error",
      }),
    );
    expect(result.summaries.candidate.completedCases).toBe(3);
  });

  it("stops retrying after repeated retryable provider errors", async () => {
    const retryableProviderError = {
      ok: false as const,
      error: "Temporary provider failure.",
      kind: "provider_error" as const,
      retryable: true,
    };
    const analyzeFoodPhotoImpl = vi
      .fn()
      .mockResolvedValueOnce(retryableProviderError)
      .mockResolvedValueOnce(retryableProviderError)
      .mockResolvedValueOnce(retryableProviderError)
      .mockResolvedValue(readyEstimate("candidate"));

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

    expect(analyzeFoodPhotoImpl).toHaveBeenCalledTimes(5);
    expect(result.cases[0]?.candidate.failureKind).toBe("provider_error");
    expect(result.cases[1]?.candidate.failureKind).toBe("provider_error");
    expect(result.cases[2]?.candidate.ok).toBe(true);
    expect(result.cases[3]?.candidate.ok).toBe(true);
  });

  it("rejects stale, mismatched, or wrong-fixture baselines", () => {
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

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
          fixtureIds: fixtures.map((fixture) => fixture.id),
          results: fixtures.map((fixture) => successfulBaselineResult(fixture)),
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date().toISOString(),
          fixtureIds: [
            fixtures[1]!.id,
            fixtures[0]!.id,
            fixtures[2]!.id,
            fixtures[3]!.id,
          ],
          results: fixtures.map((fixture) => successfulBaselineResult(fixture)),
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();
  });

  it("rejects future-dated baselines", () => {
    const fixtures = MACRO_BENCHMARK_FIXTURES.slice(0, 4);

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date(Date.now() + 60_000).toISOString(),
          fixtureIds: fixtures.map((fixture) => fixture.id),
          results: fixtures.map((fixture) => successfulBaselineResult(fixture)),
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();
  });

  it("rejects tampered baseline result models and error fields", () => {
    const fixtures = MACRO_BENCHMARK_FIXTURES.slice(0, 4);
    const validResults = fixtures.map((fixture) =>
      successfulBaselineResult(fixture),
    );

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date().toISOString(),
          fixtureIds: fixtures.map((fixture) => fixture.id),
          results: [
            successfulBaselineResult(fixtures[0]!, "other/free"),
            ...validResults.slice(1),
          ],
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();

    const tamperedResults = [...validResults];
    tamperedResults[0] = {
      ...tamperedResults[0]!,
      absoluteError: {
        ...tamperedResults[0]!.absoluteError!,
        caloriesKcal: 999,
      },
    };

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date().toISOString(),
          fixtureIds: fixtures.map((fixture) => fixture.id),
          results: tamperedResults,
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();
  });

  it("rejects failed, skipped, or transient-capacity baseline reuse", () => {
    const fixtures = MACRO_BENCHMARK_FIXTURES.slice(0, 4);
    const fixtureIds = fixtures.map((fixture) => fixture.id);

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date().toISOString(),
          fixtureIds,
          results: [
            ...fixtures
              .slice(0, 3)
              .map((fixture) => successfulBaselineResult(fixture)),
            failureBaselineResult(),
          ],
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date().toISOString(),
          fixtureIds,
          results: [
            successfulBaselineResult(fixtures[0]!),
            failureBaselineResult(),
            failureBaselineResult({ latencyMs: null, wasSkipped: true }),
            failureBaselineResult({ latencyMs: null, wasSkipped: true }),
          ],
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date().toISOString(),
          fixtureIds,
          results: [
            failureBaselineResult({
              error: "Rate limit exceeded.",
              failureKind: "provider_rate_limit",
              retryable: true,
            }),
            ...fixtures
              .slice(1)
              .map((fixture) => successfulBaselineResult(fixture)),
          ],
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();
  });

  it("rejects malformed baseline result rows", () => {
    const fixtures = MACRO_BENCHMARK_FIXTURES.slice(0, 4);
    const fixtureIds = fixtures.map((fixture) => fixture.id);
    const malformedResults = fixtures.map((fixture) =>
      successfulBaselineResult(fixture),
    );
    malformedResults[0] = {
      ...malformedResults[0]!,
      estimate: {
        ...malformedResults[0]!.estimate!,
        caloriesKcal: Number.NaN,
      },
    };

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date().toISOString(),
          fixtureIds,
          results: malformedResults,
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();

    const invalidErrorResults = fixtures.map((fixture) =>
      successfulBaselineResult(fixture),
    );
    invalidErrorResults[0] = {
      ...invalidErrorResults[0]!,
      normalizedErrorPct: Number.POSITIVE_INFINITY,
    };

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date().toISOString(),
          fixtureIds,
          results: invalidErrorResults,
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();

    expect(
      validateBenchmarkBaseline({
        baseline: {
          currentModel: "current/free",
          createdAt: new Date().toISOString(),
          fixtureIds,
          results: [
            {
              ...failureBaselineResult(),
              failureKind: "not_a_known_failure",
            } as unknown as MacroBenchmarkModelCaseResult,
            ...fixtures
              .slice(1)
              .map((fixture) => successfulBaselineResult(fixture)),
          ],
        },
        currentModel: "current/free",
        fixtures,
      }),
    ).toBeNull();
  });
});
