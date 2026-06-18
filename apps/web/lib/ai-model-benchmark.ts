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
  fixtures: MacroBenchmarkFixture[];
  cases: MacroBenchmarkCaseResult[];
  summaries: {
    current: MacroBenchmarkModelSummary;
    candidate: MacroBenchmarkModelSummary;
  };
};

const IMAGE_FETCH_TIMEOUT_MS = 15_000;
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

async function fetchFixtureImage(fixture: MacroBenchmarkFixture) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(fixture.imageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Macro Tracker AI benchmark",
      },
    });

    if (!response.ok) {
      throw new Error(`Image fetch failed with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      throw new Error(`Image URL returned ${contentType}.`);
    }

    return new File([await response.arrayBuffer()], `${fixture.id}.jpg`, {
      type: contentType.split(";")[0]?.trim() || "image/jpeg",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function runFixtureForModel(params: {
  fixture: MacroBenchmarkFixture;
  image: File;
  model: string;
  userId: string;
}): Promise<MacroBenchmarkModelCaseResult> {
  const startedAt = performance.now();
  const result = await analyzeFoodPhoto({
    image: params.image,
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
  userId: string;
}): Promise<MacroBenchmarkResult> {
  const candidateModel = params.candidateModel.trim();
  const currentModel = getConfiguredFoodPhotoModel();
  const cases: MacroBenchmarkCaseResult[] = [];

  for (const fixture of MACRO_BENCHMARK_FIXTURES) {
    const image = await fetchFixtureImage(fixture);
    const current = await runFixtureForModel({
      fixture,
      image,
      model: currentModel,
      userId: params.userId,
    });
    const candidate = await runFixtureForModel({
      fixture,
      image,
      model: candidateModel,
      userId: params.userId,
    });

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
    fixtures: MACRO_BENCHMARK_FIXTURES,
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
