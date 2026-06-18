import { describe, expect, it } from "vitest";

import { calculateMacroBenchmarkError } from "@/lib/ai-model-benchmark";

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
});
