import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  analyzeFoodPhoto,
  getConfiguredFoodPhotoModel,
  type AnalyzeFoodPhotoFailureKind,
  type AnalyzeFoodPhotoResult,
  type FoodPhotoEstimate,
} from "./ai-food-photo";

export type MacroBenchmarkMacros = {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type MacroBenchmarkCategory =
  | "fruit"
  | "protein"
  | "grain"
  | "vegetable"
  | "dairy"
  | "fat"
  | "legume";

export type MacroBenchmarkFixture = {
  id: string;
  name: string;
  servingDescription: string;
  assetFileName: string;
  thumbnailUrl: string;
  imageSourceUrl: string;
  expected: MacroBenchmarkMacros;
  expectedSource: string;
  category: MacroBenchmarkCategory;
};

export type MacroBenchmarkModelCaseResult = {
  model: string;
  ok: boolean;
  latencyMs: number | null;
  estimate: FoodPhotoEstimate | null;
  absoluteError: MacroBenchmarkMacros | null;
  normalizedErrorPct: number | null;
  error: string | null;
  failureKind?: AnalyzeFoodPhotoFailureKind;
  retryable?: boolean;
  wasSkipped?: boolean;
};

export type MacroBenchmarkCaseResult = {
  fixtureId: string;
  fixtureName: string;
  servingDescription: string;
  thumbnailUrl: string;
  imageSourceUrl: string;
  expected: MacroBenchmarkMacros;
  expectedSource: string;
  category: MacroBenchmarkCategory;
  current: MacroBenchmarkModelCaseResult;
  candidate: MacroBenchmarkModelCaseResult;
};

export type MacroBenchmarkMode = "compare" | "candidate_only";

export type MacroBenchmarkBaseline = {
  currentModel: string;
  fixtureIds: string[];
  results: MacroBenchmarkModelCaseResult[];
  createdAt: string;
};

export type MacroBenchmarkModelSummary = {
  model: string;
  completedCases: number;
  failedCases: number;
  skippedCases: number;
  averageLatencyMs: number | null;
  averageErrorPct: number | null;
  reliabilityPct: number;
  failureBreakdown: Record<AnalyzeFoodPhotoFailureKind | "skipped", number>;
  categoryAverages: Record<MacroBenchmarkCategory, number | null>;
};

export type MacroBenchmarkResult = {
  currentModel: string;
  candidateModel: string;
  fixtureCount: number;
  totalFixtureCount: number;
  comparedSameModel: boolean;
  mode: MacroBenchmarkMode;
  usedBaseline: boolean;
  baselineCreatedAt: string | null;
  fixtures: MacroBenchmarkFixture[];
  cases: MacroBenchmarkCaseResult[];
  summaries: {
    current: MacroBenchmarkModelSummary | null;
    candidate: MacroBenchmarkModelSummary;
  };
};

const ERROR_DENOMINATORS: MacroBenchmarkMacros = {
  caloriesKcal: 50,
  proteinG: 5,
  carbsG: 5,
  fatG: 5,
};

export const BENCHMARK_REQUEST_DELAY_MS = 3500;
export const BENCHMARK_RETRY_DELAY_MS = 8000;
const BASELINE_TTL_MS = 24 * 60 * 60 * 1000;

type AnalyzeFoodPhotoFn = typeof analyzeFoodPhoto;

const FAILURE_KINDS: AnalyzeFoodPhotoFailureKind[] = [
  "missing_api_key",
  "invalid_image",
  "provider_rate_limit",
  "provider_quota",
  "provider_image_access",
  "provider_error",
  "empty_response",
  "invalid_json",
  "unsupported_model",
  "unknown",
];

const CATEGORIES: MacroBenchmarkCategory[] = [
  "fruit",
  "protein",
  "grain",
  "vegetable",
  "dairy",
  "fat",
  "legume",
];

function fixtureAsset(fileName: string) {
  return {
    assetFileName: fileName,
    thumbnailUrl: `/benchmark-foods/${fileName}`,
  };
}

export const MACRO_BENCHMARK_FIXTURES: MacroBenchmarkFixture[] = [
  {
    id: "medium-banana",
    name: "Medium banana",
    servingDescription: "One medium banana, edible portion only.",
    ...fixtureAsset("banana.jpg"),
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Banana-Single.jpg",
    expected: { caloriesKcal: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4 },
    expectedSource: "USDA FoodData Central, one medium banana, rounded.",
    category: "fruit",
  },
  {
    id: "medium-red-apple",
    name: "Medium red apple",
    servingDescription: "One medium raw apple with skin.",
    ...fixtureAsset("apple.jpg"),
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Red_Apple.jpg",
    expected: { caloriesKcal: 95, proteinG: 0.5, carbsG: 25.1, fatG: 0.3 },
    expectedSource: "USDA FoodData Central, one medium apple with skin, rounded.",
    category: "fruit",
  },
  {
    id: "large-hard-boiled-egg",
    name: "Large hard-boiled egg",
    servingDescription: "One large hard-boiled egg.",
    ...fixtureAsset("hard-boiled-egg.jpg"),
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Hard_boiled_egg.jpg",
    expected: { caloriesKcal: 78, proteinG: 6.3, carbsG: 0.6, fatG: 5.3 },
    expectedSource: "USDA FoodData Central, one large hard-boiled egg, rounded.",
    category: "protein",
  },
  {
    id: "medium-orange",
    name: "Medium orange",
    servingDescription: "One medium raw orange, peeled edible portion.",
    ...fixtureAsset("orange.jpg"),
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Ambersweet_oranges.jpg",
    expected: { caloriesKcal: 62, proteinG: 1.2, carbsG: 15.4, fatG: 0.2 },
    expectedSource: "USDA FoodData Central, one medium orange, rounded.",
    category: "fruit",
  },
  {
    id: "cooked-white-rice-cup",
    name: "Cooked white rice",
    servingDescription: "One cup cooked long-grain white rice.",
    ...fixtureAsset("white-rice.jpg"),
    imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Cooked_white_rice.jpg",
    expected: { caloriesKcal: 205, proteinG: 4.3, carbsG: 44.5, fatG: 0.4 },
    expectedSource: "USDA FoodData Central, one cup cooked white rice, rounded.",
    category: "grain",
  },
  {
    id: "cooked-pasta-cup",
    name: "Cooked spaghetti",
    servingDescription: "One cup cooked plain spaghetti pasta.",
    ...fixtureAsset("pasta.jpg"),
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:(Pasta)_by_David_Adam_Kess_(pic.2).jpg",
    expected: { caloriesKcal: 221, proteinG: 8.1, carbsG: 43.2, fatG: 1.3 },
    expectedSource: "USDA FoodData Central, one cup cooked spaghetti, rounded.",
    category: "grain",
  },
  {
    id: "half-avocado",
    name: "Half avocado",
    servingDescription: "One half medium raw avocado.",
    ...fixtureAsset("avocado.jpg"),
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Liat_Portal_for_Foodie_Disorder_-_Avocado_halves.jpg",
    expected: { caloriesKcal: 120, proteinG: 1.5, carbsG: 6.4, fatG: 11 },
    expectedSource: "USDA FoodData Central, half medium avocado, rounded.",
    category: "fat",
  },
  {
    id: "cooked-broccoli-cup",
    name: "Cooked broccoli",
    servingDescription: "One cup cooked chopped broccoli.",
    ...fixtureAsset("broccoli.jpg"),
    imageSourceUrl:
      "https://commons.wikimedia.org/wiki/File:Broccoli_florets_on_ice.jpg",
    expected: { caloriesKcal: 55, proteinG: 3.7, carbsG: 11.2, fatG: 0.6 },
    expectedSource: "USDA FoodData Central, one cup cooked broccoli, rounded.",
    category: "vegetable",
  },
  {
    id: "medium-carrot",
    name: "Medium carrot",
    servingDescription: "One medium raw carrot.",
    ...fixtureAsset("carrot.jpg"),
    imageSourceUrl: "https://loremflickr.com/512/512/carrot,food",
    expected: { caloriesKcal: 25, proteinG: 0.6, carbsG: 5.8, fatG: 0.1 },
    expectedSource: "USDA FoodData Central, one medium raw carrot, rounded.",
    category: "vegetable",
  },
  {
    id: "white-bread-slice",
    name: "White bread slice",
    servingDescription: "One regular slice white bread.",
    ...fixtureAsset("white-bread.jpg"),
    imageSourceUrl: "https://loremflickr.com/512/512/toast,food",
    expected: { caloriesKcal: 75, proteinG: 2.6, carbsG: 13.8, fatG: 1 },
    expectedSource: "USDA FoodData Central, one slice white bread, rounded.",
    category: "grain",
  },
  {
    id: "cheddar-ounce",
    name: "Cheddar cheese",
    servingDescription: "One ounce cheddar cheese.",
    ...fixtureAsset("cheddar.jpg"),
    imageSourceUrl: "https://loremflickr.com/512/512/cheddar,food",
    expected: { caloriesKcal: 113, proteinG: 6.4, carbsG: 0.9, fatG: 9.3 },
    expectedSource: "USDA FoodData Central, one ounce cheddar cheese, rounded.",
    category: "dairy",
  },
  {
    id: "almonds-ounce",
    name: "Raw almonds",
    servingDescription: "One ounce raw almonds.",
    ...fixtureAsset("almonds.jpg"),
    imageSourceUrl: "https://loremflickr.com/512/512/almonds,food",
    expected: { caloriesKcal: 164, proteinG: 6, carbsG: 6.1, fatG: 14.2 },
    expectedSource: "USDA FoodData Central, one ounce raw almonds, rounded.",
    category: "fat",
  },
  {
    id: "rolled-oats-40g",
    name: "Rolled oats",
    servingDescription: "Forty grams dry rolled oats.",
    ...fixtureAsset("oats.jpg"),
    imageSourceUrl: "https://loremflickr.com/512/512/oats,food",
    expected: { caloriesKcal: 150, proteinG: 5, carbsG: 27, fatG: 3 },
    expectedSource: "Common nutrition label serving, 40g dry rolled oats.",
    category: "grain",
  },
  {
    id: "cooked-shrimp-100g",
    name: "Cooked shrimp",
    servingDescription: "One hundred grams cooked shrimp.",
    ...fixtureAsset("shrimp.jpg"),
    imageSourceUrl: "https://loremflickr.com/512/512/prawn,food",
    expected: { caloriesKcal: 99, proteinG: 24, carbsG: 0.2, fatG: 0.3 },
    expectedSource: "USDA FoodData Central, 100g cooked shrimp, rounded.",
    category: "protein",
  },
  {
    id: "cooked-salmon-100g",
    name: "Cooked salmon",
    servingDescription: "One hundred grams cooked Atlantic salmon.",
    ...fixtureAsset("salmon.jpg"),
    imageSourceUrl: "https://loremflickr.com/512/512/salmon,food",
    expected: { caloriesKcal: 206, proteinG: 22.1, carbsG: 0, fatG: 12.4 },
    expectedSource: "USDA FoodData Central, 100g cooked Atlantic salmon, rounded.",
    category: "protein",
  },
  {
    id: "cooked-lentils-cup",
    name: "Cooked lentils",
    servingDescription: "One cup cooked lentils.",
    ...fixtureAsset("lentils.jpg"),
    imageSourceUrl: "https://loremflickr.com/512/512/lentils,food",
    expected: { caloriesKcal: 230, proteinG: 17.9, carbsG: 39.9, fatG: 0.8 },
    expectedSource: "USDA FoodData Central, one cup cooked lentils, rounded.",
    category: "legume",
  },
  {
    id: "whole-milk-cup",
    name: "Whole milk",
    servingDescription: "One cup whole milk.",
    ...fixtureAsset("whole-milk.jpg"),
    imageSourceUrl: "https://loremflickr.com/512/512/milk,food",
    expected: { caloriesKcal: 149, proteinG: 7.7, carbsG: 11.7, fatG: 7.9 },
    expectedSource: "USDA FoodData Central, one cup whole milk, rounded.",
    category: "dairy",
  },
  {
    id: "nonfat-greek-yogurt-170g",
    name: "Greek yogurt",
    servingDescription: "One 170g serving plain nonfat Greek yogurt.",
    ...fixtureAsset("greek-yogurt.jpg"),
    imageSourceUrl: "https://loremflickr.com/512/512/yogurt,food",
    expected: { caloriesKcal: 100, proteinG: 17.3, carbsG: 6.1, fatG: 0.7 },
    expectedSource: "USDA FoodData Central, 170g plain nonfat Greek yogurt, rounded.",
    category: "dairy",
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

function delay(ms: number) {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}

function macroKeys() {
  return ["caloriesKcal", "proteinG", "carbsG", "fatG"] as const;
}

function inferImageMimeType(assetFileName: string) {
  const extension = path.extname(assetFileName).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  throw new Error(`Unsupported benchmark fixture image type: ${assetFileName}`);
}

export async function loadFixtureImageDataUrl(
  fixture: MacroBenchmarkFixture,
): Promise<string> {
  const assetPath = path.join(
    process.cwd(),
    "public",
    "benchmark-foods",
    fixture.assetFileName,
  );
  const buffer = await readFile(assetPath);
  return `data:${inferImageMimeType(fixture.assetFileName)};base64,${buffer.toString(
    "base64",
  )}`;
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

function emptyFailureBreakdown() {
  return Object.fromEntries([
    ...FAILURE_KINDS.map((kind) => [kind, 0]),
    ["skipped", 0],
  ]) as Record<AnalyzeFoodPhotoFailureKind | "skipped", number>;
}

function emptyCategoryAverages() {
  return Object.fromEntries(
    CATEGORIES.map((category) => [category, null]),
  ) as Record<MacroBenchmarkCategory, number | null>;
}

function createFailureResult(params: {
  model: string;
  error: string;
  failureKind: AnalyzeFoodPhotoFailureKind;
  latencyMs: number | null;
  retryable?: boolean;
  wasSkipped?: boolean;
}): MacroBenchmarkModelCaseResult {
  return {
    model: params.model,
    ok: false,
    latencyMs: params.latencyMs,
    estimate: null,
    absoluteError: null,
    normalizedErrorPct: null,
    error: params.error,
    failureKind: params.failureKind,
    retryable: params.retryable,
    wasSkipped: params.wasSkipped,
  };
}

function skippedModelResult(
  model: string,
  failureKind: AnalyzeFoodPhotoFailureKind,
): MacroBenchmarkModelCaseResult {
  return createFailureResult({
    model,
    error: `Skipped after ${failureKind} on earlier fixture.`,
    failureKind,
    latencyMs: null,
    retryable: false,
    wasSkipped: true,
  });
}

function isProviderCapacityFailure(
  failureKind?: AnalyzeFoodPhotoFailureKind,
) {
  return (
    failureKind === "provider_rate_limit" ||
    failureKind === "provider_quota" ||
    failureKind === "provider_image_access"
  );
}

function shouldRetryFailure(failureKind?: AnalyzeFoodPhotoFailureKind) {
  return (
    failureKind === "provider_rate_limit" ||
    failureKind === "provider_error" ||
    failureKind === "empty_response" ||
    failureKind === "invalid_json" ||
    failureKind === "unknown"
  );
}

function normalizeFixtureLimit(fixtureLimit: number | undefined) {
  if (fixtureLimit === 4 || fixtureLimit === 8 || fixtureLimit === 12) {
    return fixtureLimit;
  }

  if (fixtureLimit === 18) {
    return MACRO_BENCHMARK_FIXTURES.length;
  }

  return 4;
}

function isValidModelResult(value: unknown): value is MacroBenchmarkModelCaseResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.model === "string" &&
    typeof record.ok === "boolean" &&
    (typeof record.latencyMs === "number" || record.latencyMs === null) &&
    ("estimate" in record ? true : true) &&
    ("absoluteError" in record ? true : true) &&
    ("normalizedErrorPct" in record ? true : true) &&
    ("error" in record ? true : true)
  );
}

export function validateBenchmarkBaseline(params: {
  baseline: MacroBenchmarkBaseline | undefined;
  currentModel: string;
  fixtures: MacroBenchmarkFixture[];
}): MacroBenchmarkBaseline | null {
  const { baseline, currentModel, fixtures } = params;

  if (!baseline || baseline.currentModel !== currentModel) {
    return null;
  }

  const createdAtMs = Date.parse(baseline.createdAt);
  if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > BASELINE_TTL_MS) {
    return null;
  }

  if (
    baseline.fixtureIds.length !== fixtures.length ||
    baseline.results.length !== fixtures.length
  ) {
    return null;
  }

  if (
    baseline.fixtureIds.some((fixtureId, index) => fixtureId !== fixtures[index]?.id)
  ) {
    return null;
  }

  if (!baseline.results.every(isValidModelResult)) {
    return null;
  }

  return baseline;
}

async function runFixtureForModel(params: {
  analyzeFoodPhotoImpl: AnalyzeFoodPhotoFn;
  fixture: MacroBenchmarkFixture;
  imageDataUrl: string;
  model: string;
  userId: string;
}): Promise<MacroBenchmarkModelCaseResult> {
  const startedAt = performance.now();
  const result: AnalyzeFoodPhotoResult = await params.analyzeFoodPhotoImpl({
    forceReady: true,
    imageUrl: params.imageDataUrl,
    maxAttempts: 1,
    model: params.model,
    userId: params.userId,
    clarification: `Benchmark fixture: ${params.fixture.servingDescription}`,
  });
  const latencyMs = Math.round(performance.now() - startedAt);

  if (!result.ok) {
    return createFailureResult({
      model: params.model,
      error: result.error,
      failureKind: result.kind,
      latencyMs,
      retryable: result.retryable,
    });
  }

  if (result.analysis.status !== "ready") {
    return createFailureResult({
      model: params.model,
      error: result.analysis.question,
      failureKind: "empty_response",
      latencyMs,
      retryable: true,
    });
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

async function runModelCallWithRateLimit(params: {
  analyzeFoodPhotoImpl: AnalyzeFoodPhotoFn;
  fixture: MacroBenchmarkFixture;
  imageDataUrl: string;
  model: string;
  userId: string;
  requestDelayMs: number;
  retryDelayMs: number;
  hasMadeOpenRouterRequest: boolean;
  markOpenRouterRequestMade: () => void;
}) {
  if (params.hasMadeOpenRouterRequest) {
    await delay(params.requestDelayMs);
  }

  params.markOpenRouterRequestMade();
  const firstResult = await runFixtureForModel(params);

  if (
    firstResult.retryable &&
    shouldRetryFailure(firstResult.failureKind)
  ) {
    await delay(params.retryDelayMs);
    params.markOpenRouterRequestMade();
    return runFixtureForModel(params);
  }

  return firstResult;
}

function summarizeModel(
  model: string,
  results: MacroBenchmarkModelCaseResult[],
  fixtures: MacroBenchmarkFixture[],
): MacroBenchmarkModelSummary {
  const successfulResults = results.filter(
    (result) => result.ok && result.normalizedErrorPct !== null,
  );
  const attemptedResults = results.filter(
    (result) => !result.wasSkipped && result.latencyMs !== null,
  );
  const failureBreakdown = emptyFailureBreakdown();
  const categoryAverages = emptyCategoryAverages();

  for (const result of results) {
    if (result.wasSkipped) {
      failureBreakdown.skipped += 1;
    } else if (!result.ok) {
      failureBreakdown[result.failureKind ?? "unknown"] += 1;
    }
  }

  for (const category of CATEGORIES) {
    const values = results
      .map((result, index) =>
        fixtures[index]?.category === category ? result.normalizedErrorPct : null,
      )
      .filter((value): value is number => typeof value === "number");
    const categoryAverage = average(values);
    categoryAverages[category] =
      categoryAverage === null ? null : roundOne(categoryAverage);
  }

  const averageLatencyMs = average(
    attemptedResults
      .map((result) => result.latencyMs)
      .filter((value): value is number => value !== null),
  );
  const averageErrorPct = average(
    successfulResults
      .map((result) => result.normalizedErrorPct)
      .filter((value): value is number => value !== null),
  );

  return {
    model,
    completedCases: successfulResults.length,
    failedCases: results.filter((result) => !result.ok && !result.wasSkipped).length,
    skippedCases: results.filter((result) => result.wasSkipped).length,
    averageLatencyMs:
      averageLatencyMs === null ? null : Math.round(averageLatencyMs),
    averageErrorPct: averageErrorPct === null ? null : roundOne(averageErrorPct),
    reliabilityPct:
      results.length === 0 ? 0 : roundOne((successfulResults.length / results.length) * 100),
    failureBreakdown,
    categoryAverages,
  };
}

function createCaseResult(params: {
  fixture: MacroBenchmarkFixture;
  current: MacroBenchmarkModelCaseResult;
  candidate: MacroBenchmarkModelCaseResult;
}): MacroBenchmarkCaseResult {
  return {
    fixtureId: params.fixture.id,
    fixtureName: params.fixture.name,
    servingDescription: params.fixture.servingDescription,
    thumbnailUrl: params.fixture.thumbnailUrl,
    imageSourceUrl: params.fixture.imageSourceUrl,
    expected: params.fixture.expected,
    expectedSource: params.fixture.expectedSource,
    category: params.fixture.category,
    current: params.current,
    candidate: params.candidate,
  };
}

export async function runMacroBenchmark(params: {
  analyzeFoodPhotoImpl?: AnalyzeFoodPhotoFn;
  baseline?: MacroBenchmarkBaseline;
  candidateModel: string;
  currentModel?: string;
  fixtureLimit?: number;
  mode?: MacroBenchmarkMode;
  requestDelayMs?: number;
  retryDelayMs?: number;
  userId: string;
}): Promise<MacroBenchmarkResult> {
  const candidateModel = params.candidateModel.trim();
  const currentModel = params.currentModel ?? getConfiguredFoodPhotoModel();
  const analyzeFoodPhotoImpl = params.analyzeFoodPhotoImpl ?? analyzeFoodPhoto;
  const fixtureLimit = normalizeFixtureLimit(params.fixtureLimit);
  const fixtures = MACRO_BENCHMARK_FIXTURES.slice(0, fixtureLimit);
  const mode = params.mode ?? "compare";
  const comparedSameModel = mode === "compare" && candidateModel === currentModel;
  const baseline = validateBenchmarkBaseline({
    baseline: params.baseline,
    currentModel,
    fixtures,
  });
  const cases: MacroBenchmarkCaseResult[] = [];
  let currentStopKind: AnalyzeFoodPhotoFailureKind | null = null;
  let candidateStopKind: AnalyzeFoodPhotoFailureKind | null = null;
  let hasMadeOpenRouterRequest = false;
  const requestDelayMs = params.requestDelayMs ?? BENCHMARK_REQUEST_DELAY_MS;
  const retryDelayMs = params.retryDelayMs ?? BENCHMARK_RETRY_DELAY_MS;
  const markOpenRouterRequestMade = () => {
    hasMadeOpenRouterRequest = true;
  };

  for (const [index, fixture] of fixtures.entries()) {
    let current: MacroBenchmarkModelCaseResult | null =
      mode === "compare" && baseline
        ? baseline.results[index] ?? null
        : null;
    let candidate: MacroBenchmarkModelCaseResult | null = null;

    if (comparedSameModel && current) {
      candidate = current;
    }

    let imageDataUrl: string | null = null;
    if (!current || !candidate) {
      try {
        imageDataUrl = await loadFixtureImageDataUrl(fixture);
      } catch {
        const error = `Fixture asset missing: /benchmark-foods/${fixture.assetFileName}`;
        current ??= createFailureResult({
          model: currentModel,
          error,
          failureKind: "invalid_image",
          latencyMs: null,
        });
        candidate ??= createFailureResult({
          model: candidateModel,
          error,
          failureKind: "invalid_image",
          latencyMs: null,
        });
      }
    }

    if (mode === "candidate_only") {
      current ??= createFailureResult({
        model: currentModel,
        error: "Not run in candidate-only mode.",
        failureKind: "unknown",
        latencyMs: null,
        wasSkipped: true,
      });
    } else if (!current) {
      if (currentStopKind) {
        current = skippedModelResult(currentModel, currentStopKind);
      } else if (imageDataUrl) {
        current = await runModelCallWithRateLimit({
          analyzeFoodPhotoImpl,
          fixture,
          imageDataUrl,
          model: currentModel,
          userId: params.userId,
          requestDelayMs,
          retryDelayMs,
          hasMadeOpenRouterRequest,
          markOpenRouterRequestMade,
        });

        if (!current.ok && isProviderCapacityFailure(current.failureKind)) {
          currentStopKind = current.failureKind ?? "unknown";
        }
      }
    }

    if (!candidate) {
      if (comparedSameModel && current) {
        candidate = current;
      } else if (candidateStopKind) {
        candidate = skippedModelResult(candidateModel, candidateStopKind);
      } else if (imageDataUrl) {
        candidate = await runModelCallWithRateLimit({
          analyzeFoodPhotoImpl,
          fixture,
          imageDataUrl,
          model: candidateModel,
          userId: params.userId,
          requestDelayMs,
          retryDelayMs,
          hasMadeOpenRouterRequest,
          markOpenRouterRequestMade,
        });

        if (!candidate.ok && isProviderCapacityFailure(candidate.failureKind)) {
          candidateStopKind = candidate.failureKind ?? "unknown";
        }
      }
    }

    cases.push(
      createCaseResult({
        fixture,
        current:
          current ??
          createFailureResult({
            model: currentModel,
            error: "Current model was not run.",
            failureKind: "unknown",
            latencyMs: null,
            wasSkipped: true,
          }),
        candidate:
          candidate ??
          createFailureResult({
            model: candidateModel,
            error: "Candidate model was not run.",
            failureKind: "unknown",
            latencyMs: null,
            wasSkipped: true,
          }),
      }),
    );
  }

  return {
    currentModel,
    candidateModel,
    fixtureCount: fixtures.length,
    totalFixtureCount: MACRO_BENCHMARK_FIXTURES.length,
    comparedSameModel,
    mode,
    usedBaseline: mode === "compare" && Boolean(baseline),
    baselineCreatedAt: mode === "compare" ? baseline?.createdAt ?? null : null,
    fixtures,
    cases,
    summaries: {
      current:
        mode === "candidate_only"
          ? null
          : summarizeModel(
              currentModel,
              cases.map((item) => item.current),
              fixtures,
            ),
      candidate: summarizeModel(
        candidateModel,
        cases.map((item) => item.candidate),
        fixtures,
      ),
    },
  };
}
