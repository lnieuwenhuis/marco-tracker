import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeFoodPhoto,
  classifyFoodPhotoFailure,
  DEFAULT_FOOD_PHOTO_FALLBACK_MODELS,
  DEFAULT_FOOD_PHOTO_MODEL,
  getConfiguredFoodPhotoModel,
  getConfiguredFoodPhotoModels,
  isFreeOpenRouterModel,
  parseFoodPhotoAnalysis,
} from "@/lib/ai-food-photo";

const OPENROUTER_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_FALLBACK_MODELS",
  "OPENROUTER_MODEL_TIMEOUT_MS",
] as const;
const originalOpenRouterEnv = Object.fromEntries(
  OPENROUTER_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof OPENROUTER_ENV_KEYS)[number], string | undefined>;

function restoreOpenRouterEnv() {
  for (const key of OPENROUTER_ENV_KEYS) {
    const originalValue = originalOpenRouterEnv[key];
    if (typeof originalValue === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
}

function foodImage() {
  return new File(["fake image"], "food.jpg", { type: "image/jpeg" });
}

function readyResponse(label = "banana") {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              status: "ready",
              question: null,
              estimate: {
                label,
                caloriesKcal: 105,
                proteinG: 1.3,
                carbsG: 27,
                fatG: 0.4,
                confidence: 0.9,
                notes: ["estimated portion"],
              },
            }),
          },
        },
      ],
    }),
    { status: 200 },
  );
}

function modelFromFetchCall(
  fetchMock: ReturnType<typeof vi.fn>,
  callIndex: number,
) {
  const [, init] = fetchMock.mock.calls[callIndex] as [unknown, RequestInit];
  const body = JSON.parse(String(init.body)) as { model: string };
  return body.model;
}

afterEach(() => {
  restoreOpenRouterEnv();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("parseFoodPhotoAnalysis", () => {
  it("parses a ready nutrition estimate", () => {
    expect(
      parseFoodPhotoAnalysis(
        JSON.stringify({
          status: "ready",
          question: null,
          estimate: {
            label: "Chicken rice bowl",
            caloriesKcal: 612.4,
            proteinG: 42.24,
            carbsG: 58.21,
            fatG: 18.06,
            confidence: 1.3,
            notes: ["Assumes one medium bowl", "Grilled chicken"],
          },
        }),
      ),
    ).toEqual({
      status: "ready",
      question: null,
      estimate: {
        label: "Chicken rice bowl",
        caloriesKcal: 612,
        proteinG: 42.2,
        carbsG: 58.2,
        fatG: 18.1,
        confidence: 1,
        notes: ["Assumes one medium bowl", "Grilled chicken"],
      },
    });
  });

  it("parses a clarification request", () => {
    expect(
      parseFoodPhotoAnalysis(
        JSON.stringify({
          status: "needs_clarification",
          question: "What is the sauce on top?",
          estimate: null,
        }),
      ),
    ).toEqual({
      status: "needs_clarification",
      question: "What is the sauce on top?",
      estimate: null,
    });
  });

  it("accepts numeric strings returned by less strict vision models", () => {
    expect(
      parseFoodPhotoAnalysis(
        JSON.stringify({
          status: "ready",
          question: null,
          estimate: {
            label: "cheeseburger with fries",
            caloriesKcal: 850,
            proteinG: 45,
            carbsG: "75",
            fatG: "45",
            confidence: "0.8",
            notes: ["estimated portion size"],
          },
        }),
      ),
    ).toEqual({
      status: "ready",
      question: null,
      estimate: {
        label: "cheeseburger with fries",
        caloriesKcal: 850,
        proteinG: 45,
        carbsG: 75,
        fatG: 45,
        confidence: 0.8,
        notes: ["estimated portion size"],
      },
    });
  });
});

describe("food photo OpenRouter model config", () => {
  it("uses the new free default with free fallback models", () => {
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_FALLBACK_MODELS;

    expect(getConfiguredFoodPhotoModel()).toBe(DEFAULT_FOOD_PHOTO_MODEL);
    expect(getConfiguredFoodPhotoModels()).toEqual([
      DEFAULT_FOOD_PHOTO_MODEL,
      ...DEFAULT_FOOD_PHOTO_FALLBACK_MODELS,
    ]);
  });

  it("rejects paid, duplicate, and deprecated configured models", () => {
    process.env.OPENROUTER_MODEL =
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
    process.env.OPENROUTER_FALLBACK_MODELS = [
      "openai/gpt-4o-mini",
      "google/gemma-4-31b-it:free",
      "google/gemma-4-31b-it:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      "openrouter/free",
    ].join(",");

    expect(getConfiguredFoodPhotoModels()).toEqual([
      DEFAULT_FOOD_PHOTO_MODEL,
      "google/gemma-4-31b-it:free",
      "openrouter/free",
    ]);
  });

  it("allows only OpenRouter free model identifiers", () => {
    expect(isFreeOpenRouterModel("google/gemma-4-26b-a4b-it:free")).toBe(true);
    expect(isFreeOpenRouterModel("openrouter/free")).toBe(true);
    expect(isFreeOpenRouterModel("openai/gpt-4o-mini")).toBe(false);
    expect(isFreeOpenRouterModel("openai/gpt-oss-20b:free:online")).toBe(false);
  });
});

describe("classifyFoodPhotoFailure", () => {
  it("classifies provider image access failures", () => {
    expect(
      classifyFoodPhotoFailure(
        "403 Forbidden, url=https://example.com/food.jpg",
        403,
      ),
    ).toBe("provider_image_access");
  });

  it("classifies free model rate limits", () => {
    expect(classifyFoodPhotoFailure("free-models-per-min exceeded")).toBe(
      "provider_rate_limit",
    );
  });

  it("classifies provider quota and balance failures", () => {
    expect(
      classifyFoodPhotoFailure("insufficient_quota: balance is too low /billing"),
    ).toBe("provider_quota");
  });
});

describe("analyzeFoodPhoto", () => {
  it("falls back to the next free model after a retryable provider failure", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_FALLBACK_MODELS;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Provider overloaded." } }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(readyResponse("fallback banana"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeFoodPhoto({
      image: foodImage(),
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(modelFromFetchCall(fetchMock, 0)).toBe(DEFAULT_FOOD_PHOTO_MODEL);
    expect(modelFromFetchCall(fetchMock, 1)).toBe(
      DEFAULT_FOOD_PHOTO_FALLBACK_MODELS[0],
    );
  });

  it("bounds a slow model call and tries the next free model", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_FALLBACK_MODELS;

    let callCount = 0;
    const fetchMock = vi.fn((_: unknown, init?: RequestInit) => {
      callCount += 1;

      if (callCount === 1) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        });
      }

      return Promise.resolve(readyResponse("timely fallback"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeFoodPhoto({
      image: foodImage(),
      modelCallTimeoutMs: 1,
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(modelFromFetchCall(fetchMock, 0)).toBe(DEFAULT_FOOD_PHOTO_MODEL);
    expect(modelFromFetchCall(fetchMock, 1)).toBe(
      DEFAULT_FOOD_PHOTO_FALLBACK_MODELS[0],
    );
  });

  it("rejects non-free model ids before calling OpenRouter", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeFoodPhoto({
      image: foodImage(),
      model: "openai/gpt-4o-mini",
      userId: "user-1",
    });

    expect(result).toMatchObject({
      ok: false,
      kind: "unsupported_model",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
