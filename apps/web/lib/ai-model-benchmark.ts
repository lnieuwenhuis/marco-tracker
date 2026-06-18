import {
  analyzeFoodPhoto,
  getConfiguredFoodPhotoModel,
  type FoodPhotoEstimate,
} from "./ai-food-photo";

export type MacroBenchmarkMacros = {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type MacroBenchmarkFixture = {
  id: string;
  name: string;
  servingDescription: string;
  imageUrl: string;
  imageSourceUrl: string;
  expected: MacroBenchmarkMacros;
  expectedSource: string;
};

export type MacroBenchmarkCaseResult = {
  fixtureId: string;
  fixtureName: string;
  servingDescription: string;
  imageUrl: string;
  imageSourceUrl: string;
  expected: MacroBenchmarkMacros;
  expectedSource: string;
  current: MacroBenchmarkModelCaseResult;
  candidate: MacroBenchmarkModelCaseResult;
};

export type MacroBenchmarkModelCaseResult = {
  model: string;
  ok: boolean;
  latencyMs: number;
  estimate: FoodPhotoEstimate | null;
  absoluteError: MacroBenchmarkMacros | null;
  normalizedErrorPct: number | null;
  error: string | null;
  retryable?: boolean;
};

export type MacroBenchmarkModelSummary = {
  model: string;
  completedCases: number;
  failedCases: number;
  averageLatencyMs: number | null;
  averageErrorPct: number | null;
};

export type MacroBenchmarkResult = {
  currentModel: string;
  candidateModel: string;
  fixtureCount: number;
  totalFixtureCount: number;
  fixtures: MacroBenchmarkFixture[];
  cases: MacroBenchmarkCaseResult[];
  summaries: {
    current: MacroBenchmarkModelSummary;
    candidate: MacroBenchmarkModelSummary;
  };
};

const ERROR_DENOMINATORS: MacroBenchmarkMacros = {
  caloriesKcal: 50,
  proteinG: 5,
  carbsG: 5,
  fatG: 5,
};

export const MACRO_BENCHMARK_FIXTURES: MacroBenchmarkFixture[] = [
  {
    id: "medium-banana",
    name: "Medium banana",
    servingDescription: "One medium banana, edible portion only.",
    imageUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Banana-Single.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Banana-Single.jpg",
    expected: {
      caloriesKcal: 105,
      proteinG: 1.3,
      carbsG: 27,
      fatG: 0.4,
    },
    expectedSource: "USDA FoodData Central, one medium banana, rounded.",
  },
  {
    id: "medium-red-apple",
    name: "Medium red apple",
    servingDescription: "One medium raw apple with skin.",
    imageUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Red_Apple.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Red_Apple.jpg",
    expected: {
      caloriesKcal: 95,
      proteinG: 0.5,
      carbsG: 25.1,
      fatG: 0.3,
    },
    expectedSource: "USDA FoodData Central, one medium apple with skin, rounded.",
  },
  {
    id: "large-hard-boiled-egg",
    name: "Large hard-boiled egg",
    servingDescription: "One large hard-boiled egg.",
    imageUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Hard_boiled_egg.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Hard_boiled_egg.jpg",
    expected: {
      caloriesKcal: 78,
      proteinG: 6.3,
      carbsG: 0.6,
      fatG: 5.3,
    },
    expectedSource: "USDA FoodData Central, one large hard-boiled egg, rounded.",
  },
  {
    id: "medium-orange",
    name: "Medium orange",
    servingDescription: "One medium raw orange, peeled edible portion.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/4/43/Ambersweet_oranges.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Ambersweet_oranges.jpg",
    expected: {
      caloriesKcal: 62,
      proteinG: 1.2,
      carbsG: 15.4,
      fatG: 0.2,
    },
    expectedSource: "USDA FoodData Central, one medium orange, rounded.",
  },
  {
    id: "cooked-white-rice-cup",
    name: "Cooked white rice",
    servingDescription: "One cup cooked long-grain white rice.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/1/16/Cooked_white_rice.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Cooked_white_rice.jpg",
    expected: {
      caloriesKcal: 205,
      proteinG: 4.3,
      carbsG: 44.5,
      fatG: 0.4,
    },
    expectedSource: "USDA FoodData Central, one cup cooked white rice, rounded.",
  },
  {
    id: "cooked-pasta-cup",
    name: "Cooked pasta",
    servingDescription: "One cup cooked plain spaghetti pasta.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/3/3f/%28Pasta%29_by_David_Adam_Kess_%28pic.2%29.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:(Pasta)_by_David_Adam_Kess_(pic.2).jpg",
    expected: {
      caloriesKcal: 221,
      proteinG: 8.1,
      carbsG: 43.2,
      fatG: 1.3,
    },
    expectedSource: "USDA FoodData Central, one cup cooked spaghetti, rounded.",
  },
  {
    id: "half-avocado",
    name: "Half avocado",
    servingDescription: "One half medium raw avocado.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/f/f0/Liat_Portal_for_Foodie_Disorder_-_Avocado_halves.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Liat_Portal_for_Foodie_Disorder_-_Avocado_halves.jpg",
    expected: {
      caloriesKcal: 120,
      proteinG: 1.5,
      carbsG: 6.4,
      fatG: 11,
    },
    expectedSource: "USDA FoodData Central, half medium avocado, rounded.",
  },
  {
    id: "cooked-broccoli-cup",
    name: "Cooked broccoli",
    servingDescription: "One cup cooked chopped broccoli.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/4/48/Broccoli_florets_on_ice.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Broccoli_florets_on_ice.jpg",
    expected: {
      caloriesKcal: 55,
      proteinG: 3.7,
      carbsG: 11.2,
      fatG: 0.6,
    },
    expectedSource: "USDA FoodData Central, one cup cooked broccoli, rounded.",
  },
  {
    id: "medium-carrot",
    name: "Medium carrot",
    servingDescription: "One medium raw carrot.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/a/a4/Raw_Carrots_in_Bowl.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Raw_Carrots_in_Bowl.jpg",
    expected: {
      caloriesKcal: 25,
      proteinG: 0.6,
      carbsG: 5.8,
      fatG: 0.1,
    },
    expectedSource: "USDA FoodData Central, one medium raw carrot, rounded.",
  },
  {
    id: "white-bread-slice",
    name: "White bread slice",
    servingDescription: "One regular slice white bread.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/b/b2/Slice_of_bread_in_bowl.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Slice_of_bread_in_bowl.jpg",
    expected: {
      caloriesKcal: 75,
      proteinG: 2.6,
      carbsG: 13.8,
      fatG: 1,
    },
    expectedSource: "USDA FoodData Central, one slice white bread, rounded.",
  },
  {
    id: "cheddar-ounce",
    name: "Cheddar cheese",
    servingDescription: "One ounce cheddar cheese.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/c/c5/Isle_of_Mull_cheddar_cheese.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Isle_of_Mull_cheddar_cheese.jpg",
    expected: {
      caloriesKcal: 113,
      proteinG: 6.4,
      carbsG: 0.9,
      fatG: 9.3,
    },
    expectedSource: "USDA FoodData Central, one ounce cheddar cheese, rounded.",
  },
  {
    id: "almonds-ounce",
    name: "Raw almonds",
    servingDescription: "One ounce raw almonds.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/b/bd/Liat_Portal_for_Foodie_Disorder_-_Raw_almonds_in_a_bowl.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Liat_Portal_for_Foodie_Disorder_-_Raw_almonds_in_a_bowl.jpg",
    expected: {
      caloriesKcal: 164,
      proteinG: 6,
      carbsG: 6.1,
      fatG: 14.2,
    },
    expectedSource: "USDA FoodData Central, one ounce raw almonds, rounded.",
  },
  {
    id: "rolled-oats-40g",
    name: "Rolled oats",
    servingDescription: "Forty grams dry rolled oats.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/c/c8/Rolled_oats_in_bowl_2.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Rolled_oats_in_bowl_2.jpg",
    expected: {
      caloriesKcal: 150,
      proteinG: 5,
      carbsG: 27,
      fatG: 3,
    },
    expectedSource: "Common nutrition label serving, 40g dry rolled oats.",
  },
  {
    id: "cooked-shrimp-100g",
    name: "Cooked shrimp",
    servingDescription: "One hundred grams cooked shrimp.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/a/ad/Cooked_shrimp.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Cooked_shrimp.jpg",
    expected: {
      caloriesKcal: 99,
      proteinG: 24,
      carbsG: 0.2,
      fatG: 0.3,
    },
    expectedSource: "USDA FoodData Central, 100g cooked shrimp, rounded.",
  },
  {
    id: "cooked-salmon-100g",
    name: "Cooked salmon",
    servingDescription: "One hundred grams cooked Atlantic salmon.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/1/10/Liat_Portal_for_Foodie_Disorder_-_Salmon_Fillet_with_Green_Chili_and_Garlic.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Liat_Portal_for_Foodie_Disorder_-_Salmon_Fillet_with_Green_Chili_and_Garlic.jpg",
    expected: {
      caloriesKcal: 206,
      proteinG: 22.1,
      carbsG: 0,
      fatG: 12.4,
    },
    expectedSource: "USDA FoodData Central, 100g cooked Atlantic salmon, rounded.",
  },
  {
    id: "cooked-lentils-cup",
    name: "Cooked lentils",
    servingDescription: "One cup cooked lentils.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/9/93/Liat_Portal_for_Foodie_Disorder_-_Cooked_Lentils_with_Caramelized_Onions.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Liat_Portal_for_Foodie_Disorder_-_Cooked_Lentils_with_Caramelized_Onions.jpg",
    expected: {
      caloriesKcal: 230,
      proteinG: 17.9,
      carbsG: 39.9,
      fatG: 0.8,
    },
    expectedSource: "USDA FoodData Central, one cup cooked lentils, rounded.",
  },
  {
    id: "whole-milk-cup",
    name: "Whole milk",
    servingDescription: "One cup whole milk.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/8/80/Bowl_milk_glass.jpg",
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Bowl_milk_glass.jpg",
    expected: {
      caloriesKcal: 149,
      proteinG: 7.7,
      carbsG: 11.7,
      fatG: 7.9,
    },
    expectedSource: "USDA FoodData Central, one cup whole milk, rounded.",
  },
  {
    id: "nonfat-greek-yogurt-170g",
    name: "Greek yogurt",
    servingDescription: "One 170g serving plain nonfat Greek yogurt.",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/e/ea/Turkish_strained_yogurt.jpg",
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Turkish_strained_yogurt.jpg",
    expected: {
      caloriesKcal: 100,
      proteinG: 17.3,
      carbsG: 6.1,
      fatG: 0.7,
    },
    expectedSource: "USDA FoodData Central, 170g plain nonfat Greek yogurt, rounded.",
  },
];

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isProviderCapacityFailure(error: string | null) {
  const lower = (error ?? "").toLowerCase();

  return (
    lower.includes("insufficient_quota") ||
    lower.includes("insufficient funds") ||
    lower.includes("balance is too low") ||
    lower.includes("/billing") ||
    lower.includes("rate-limit") ||
    lower.includes("rate limited") ||
    lower.includes("temporarily rate-limited")
  );
}

function skippedModelResult(model: string, error: string): MacroBenchmarkModelCaseResult {
  return {
    model,
    ok: false,
    latencyMs: 0,
    estimate: null,
    absoluteError: null,
    normalizedErrorPct: null,
    error,
    retryable: false,
  };
}

function macroKeys() {
  return ["caloriesKcal", "proteinG", "carbsG", "fatG"] as const;
}

export function calculateMacroBenchmarkError(
  estimate: MacroBenchmarkMacros,
  expected: MacroBenchmarkMacros,
) {
  const absoluteError = {
    caloriesKcal: Math.abs(estimate.caloriesKcal - expected.caloriesKcal),
    proteinG: Math.abs(estimate.proteinG - expected.proteinG),
    carbsG: Math.abs(estimate.carbsG - expected.carbsG),
    fatG: Math.abs(estimate.fatG - expected.fatG),
  };

  const normalizedErrorPct =
    (macroKeys().reduce((sum, key) => {
      const denominator = Math.max(expected[key], ERROR_DENOMINATORS[key]);
      return sum + absoluteError[key] / denominator;
    }, 0) /
      macroKeys().length) *
    100;

  return {
    absoluteError: {
      caloriesKcal: Math.round(absoluteError.caloriesKcal),
      proteinG: roundOne(absoluteError.proteinG),
      carbsG: roundOne(absoluteError.carbsG),
      fatG: roundOne(absoluteError.fatG),
    },
    normalizedErrorPct: roundOne(normalizedErrorPct),
  };
}

async function runFixtureForModel(params: {
  fixture: MacroBenchmarkFixture;
  model: string;
  userId: string;
}): Promise<MacroBenchmarkModelCaseResult> {
  const startedAt = performance.now();
  const result = await analyzeFoodPhoto({
    forceReady: true,
    imageUrl: params.fixture.imageUrl,
    maxAttempts: 2,
    model: params.model,
    userId: params.userId,
    clarification: `Benchmark fixture: ${params.fixture.servingDescription}`,
  });
  const latencyMs = Math.round(performance.now() - startedAt);

  if (!result.ok) {
    return {
      model: params.model,
      ok: false,
      latencyMs,
      estimate: null,
      absoluteError: null,
      normalizedErrorPct: null,
      error: result.error,
      retryable: result.retryable,
    };
  }

  if (result.analysis.status !== "ready") {
    return {
      model: params.model,
      ok: false,
      latencyMs,
      estimate: null,
      absoluteError: null,
      normalizedErrorPct: null,
      error: result.analysis.question,
    };
  }

  const error = calculateMacroBenchmarkError(
    result.analysis.estimate,
    params.fixture.expected,
  );

  return {
    model: params.model,
    ok: true,
    latencyMs,
    estimate: result.analysis.estimate,
    absoluteError: error.absoluteError,
    normalizedErrorPct: error.normalizedErrorPct,
    error: null,
  };
}

function summarizeModel(
  model: string,
  results: MacroBenchmarkModelCaseResult[],
): MacroBenchmarkModelSummary {
  const successfulResults = results.filter(
    (result) => result.ok && result.normalizedErrorPct !== null,
  );
  const averageLatencyMs = average(results.map((result) => result.latencyMs));
  const averageErrorPct = average(
    successfulResults
      .map((result) => result.normalizedErrorPct)
      .filter((value): value is number => value !== null),
  );

  return {
    model,
    completedCases: successfulResults.length,
    failedCases: results.length - successfulResults.length,
    averageLatencyMs:
      averageLatencyMs === null ? null : Math.round(averageLatencyMs),
    averageErrorPct: averageErrorPct === null ? null : roundOne(averageErrorPct),
  };
}

export async function runMacroBenchmark(params: {
  candidateModel: string;
  fixtureLimit?: number;
  userId: string;
}): Promise<MacroBenchmarkResult> {
  const candidateModel = params.candidateModel.trim();
  const currentModel = getConfiguredFoodPhotoModel();
  const fixtureLimit =
    typeof params.fixtureLimit === "number" && Number.isFinite(params.fixtureLimit)
      ? Math.max(1, Math.min(MACRO_BENCHMARK_FIXTURES.length, params.fixtureLimit))
      : MACRO_BENCHMARK_FIXTURES.length;
  const fixtures = MACRO_BENCHMARK_FIXTURES.slice(0, fixtureLimit);
  const cases: MacroBenchmarkCaseResult[] = [];
  let currentStopError: string | null = null;
  let candidateStopError: string | null = null;

  for (const fixture of fixtures) {
    const current = currentStopError
      ? skippedModelResult(currentModel, currentStopError)
      : await runFixtureForModel({
          fixture,
          model: currentModel,
          userId: params.userId,
        });
    const candidate = candidateStopError
      ? skippedModelResult(candidateModel, candidateStopError)
      : await runFixtureForModel({
          fixture,
          model: candidateModel,
          userId: params.userId,
        });

    if (!current.ok && isProviderCapacityFailure(current.error)) {
      currentStopError =
        "Skipped after provider capacity/quota failure on an earlier fixture.";
    }

    if (!candidate.ok && isProviderCapacityFailure(candidate.error)) {
      candidateStopError =
        "Skipped after provider capacity/quota failure on an earlier fixture.";
    }

    cases.push({
      fixtureId: fixture.id,
      fixtureName: fixture.name,
      servingDescription: fixture.servingDescription,
      imageUrl: fixture.imageUrl,
      imageSourceUrl: fixture.imageSourceUrl,
      expected: fixture.expected,
      expectedSource: fixture.expectedSource,
      current,
      candidate,
    });
  }

  return {
    currentModel,
    candidateModel,
    fixtureCount: fixtures.length,
    totalFixtureCount: MACRO_BENCHMARK_FIXTURES.length,
    fixtures,
    cases,
    summaries: {
      current: summarizeModel(
        currentModel,
        cases.map((item) => item.current),
      ),
      candidate: summarizeModel(
        candidateModel,
        cases.map((item) => item.candidate),
      ),
    },
  };
}
