export type FoodPhotoEstimate = {
  label: string;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: number;
  notes: string[];
};

export type FoodPhotoAnalysis =
  | {
      status: "ready";
      question: null;
      estimate: FoodPhotoEstimate;
    }
  | {
      status: "needs_clarification";
      question: string;
      estimate: null;
    };

export type AnalyzeFoodPhotoFailureKind =
  | "missing_api_key"
  | "invalid_image"
  | "provider_rate_limit"
  | "provider_quota"
  | "provider_image_access"
  | "provider_error"
  | "empty_response"
  | "invalid_json"
  | "unsupported_model"
  | "unknown";

export type AnalyzeFoodPhotoResult =
  | { ok: true; analysis: FoodPhotoAnalysis }
  | {
      ok: false;
      error: string;
      kind: AnalyzeFoodPhotoFailureKind;
      statusCode?: number;
      aiResponse?: string;
      retryable?: boolean;
    };

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_FOOD_PHOTO_MODEL =
  "google/gemma-4-26b-a4b-it:free";
export const DEFAULT_FOOD_PHOTO_FALLBACK_MODELS = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "openrouter/free",
] as const;
const DEPRECATED_FOOD_PHOTO_MODELS = new Set([
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
]);
const DEFAULT_FOOD_PHOTO_MODEL_TIMEOUT_MS = 10_000;
const DEFAULT_FOOD_PHOTO_REQUEST_TIMEOUT_MS = 25_000;
const MIN_FOOD_PHOTO_MODEL_TIMEOUT_MS = 3_000;
const MAX_FOOD_PHOTO_MODEL_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const FOOD_PHOTO_SYSTEM_PROMPT = [
  "You are a food photo nutrition estimator for a macro tracking app.",
  "You must return exactly one valid JSON object and no other text.",
  "The first character of your response must be { and the last character must be }.",
  "Do not wrap the JSON in markdown fences.",
  "Do not include reasoning, analysis, commentary, apologies, or explanations outside the JSON.",
  "Do not output safety classifications, policy labels, XML, YAML, markdown, bullet points, or prose.",
  "All numeric values must describe the visible edible portion in the photo, not per 100g unless the visible portion is 100g.",
  "Use grams for proteinG, carbsG, and fatG. Use kilocalories for caloriesKcal.",
  "Use confidence as a number from 0 to 1.",
  "If the main food or portion size is too ambiguous, ask exactly one concise question.",
  "Ready response format:",
  '{"status":"ready","question":null,"estimate":{"label":"short food name","caloriesKcal":0,"proteinG":0,"carbsG":0,"fatG":0,"confidence":0.8,"notes":["short assumption"]}}',
  "Clarification response format:",
  '{"status":"needs_clarification","question":"one short question","estimate":null}',
  "Required top-level keys are exactly: status, question, estimate.",
  "Required estimate keys are exactly: label, caloriesKcal, proteinG, carbsG, fatG, confidence, notes.",
].join("\n");

const foodPhotoResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["ready", "needs_clarification"],
      description:
        "Use ready when you can estimate the food and portion. Use needs_clarification when a main food or portion cannot be identified well enough.",
    },
    question: {
      type: ["string", "null"],
      description:
        "One concise question for the user when clarification is needed, otherwise null.",
    },
    estimate: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        label: {
          type: "string",
          description: "Short food label suitable for a meal log.",
        },
        caloriesKcal: {
          type: "integer",
          minimum: 0,
          description: "Estimated calories for the visible portion.",
        },
        proteinG: {
          type: "number",
          minimum: 0,
          description: "Estimated protein grams for the visible portion.",
        },
        carbsG: {
          type: "number",
          minimum: 0,
          description: "Estimated carbohydrate grams for the visible portion.",
        },
        fatG: {
          type: "number",
          minimum: 0,
          description: "Estimated fat grams for the visible portion.",
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence in the nutrition estimate from 0 to 1.",
        },
        notes: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
          description:
            "Brief assumptions such as portion size or preparation method.",
        },
      },
      required: [
        "label",
        "caloriesKcal",
        "proteinG",
        "carbsG",
        "fatG",
        "confidence",
        "notes",
      ],
    },
  },
  required: ["status", "question", "estimate"],
} as const;

function roundMacro(value: number) {
  return Math.round(value * 10) / 10;
}

function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseModelList(value: string | undefined) {
  return (
    value
      ?.split(/[\n,]/)
      .map((model) => model.trim())
      .filter(Boolean) ?? []
  );
}

export function isFreeOpenRouterModel(model: string) {
  const trimmedModel = model.trim();
  return trimmedModel === "openrouter/free" || trimmedModel.endsWith(":free");
}

function isDeprecatedFoodPhotoModel(model: string) {
  return DEPRECATED_FOOD_PHOTO_MODELS.has(model.trim());
}

function uniqueFreeFoodPhotoModels(models: string[]) {
  const seen = new Set<string>();
  const freeModels: string[] = [];

  for (const model of models) {
    const trimmedModel = model.trim();
    if (
      !trimmedModel ||
      !isFreeOpenRouterModel(trimmedModel) ||
      isDeprecatedFoodPhotoModel(trimmedModel) ||
      seen.has(trimmedModel)
    ) {
      continue;
    }

    seen.add(trimmedModel);
    freeModels.push(trimmedModel);
  }

  return freeModels;
}

export function getConfiguredFoodPhotoModels() {
  const configuredPrimary = process.env.OPENROUTER_MODEL?.trim();
  const primary =
    configuredPrimary &&
    isFreeOpenRouterModel(configuredPrimary) &&
    !isDeprecatedFoodPhotoModel(configuredPrimary)
      ? configuredPrimary
      : DEFAULT_FOOD_PHOTO_MODEL;
  const configuredFallbacks = parseModelList(
    process.env.OPENROUTER_FALLBACK_MODELS,
  );
  const fallbackModels =
    configuredFallbacks.length > 0
      ? configuredFallbacks
      : [...DEFAULT_FOOD_PHOTO_FALLBACK_MODELS];
  const models = uniqueFreeFoodPhotoModels([primary, ...fallbackModels]);

  return models.length > 0 ? models : [DEFAULT_FOOD_PHOTO_MODEL];
}

export function getFoodPhotoModelTimeoutMs() {
  const configuredTimeout = Number(process.env.OPENROUTER_MODEL_TIMEOUT_MS);

  if (!Number.isFinite(configuredTimeout)) {
    return DEFAULT_FOOD_PHOTO_MODEL_TIMEOUT_MS;
  }

  return clamp(
    Math.round(configuredTimeout),
    MIN_FOOD_PHOTO_MODEL_TIMEOUT_MS,
    MAX_FOOD_PHOTO_MODEL_TIMEOUT_MS,
  );
}

function numberFromAiValue(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(/,/g, "."));
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  return NaN;
}

function normalizeEstimate(value: unknown): FoodPhotoEstimate | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const caloriesKcal = numberFromAiValue(record.caloriesKcal);
  const proteinG = numberFromAiValue(record.proteinG);
  const carbsG = numberFromAiValue(record.carbsG);
  const fatG = numberFromAiValue(record.fatG);
  const confidence = numberFromAiValue(record.confidence);

  if (
    !label ||
    !Number.isFinite(caloriesKcal) ||
    !Number.isFinite(proteinG) ||
    !Number.isFinite(carbsG) ||
    !Number.isFinite(fatG) ||
    !Number.isFinite(confidence)
  ) {
    return null;
  }

  const notes = Array.isArray(record.notes)
    ? record.notes
        .filter((note): note is string => typeof note === "string")
        .map((note) => note.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    label,
    caloriesKcal: Math.max(0, Math.round(caloriesKcal)),
    proteinG: Math.max(0, roundMacro(proteinG)),
    carbsG: Math.max(0, roundMacro(carbsG)),
    fatG: Math.max(0, roundMacro(fatG)),
    confidence: roundConfidence(clamp(confidence, 0, 1)),
    notes,
  };
}

function stripMarkdownFence(content: string) {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractMessageContent(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }

        const record = part as Record<string, unknown>;
        return typeof record.text === "string" ? record.text : "";
      })
      .join("")
      .trim();
  }

  return null;
}

export function parseFoodPhotoAnalysis(content: string): FoodPhotoAnalysis {
  const parsed = JSON.parse(stripMarkdownFence(content)) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("The AI returned an invalid response.");
  }

  const record = parsed as Record<string, unknown>;

  if (record.status === "needs_clarification") {
    const question =
      typeof record.question === "string" ? record.question.trim() : "";
    if (!question) {
      throw new Error("The AI did not include a clarification question.");
    }

    return {
      status: "needs_clarification",
      question,
      estimate: null,
    };
  }

  if (record.status !== "ready") {
    throw new Error("The AI returned an unknown status.");
  }

  const estimate = normalizeEstimate(record.estimate);
  if (!estimate) {
    throw new Error("The AI did not include a usable nutrition estimate.");
  }

  return {
    status: "ready",
    question: null,
    estimate,
  };
}

function imageBufferToDataUrl(buffer: ArrayBuffer, mimeType: string) {
  return `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;
}

function supportsStructuredOutput(model: string) {
  return model === "google/gemma-4-31b-it:free" || model === "google/gemma-4-26b-a4b-it:free";
}

function supportsGenerationControls(model: string) {
  return model !== "moonshotai/kimi-k2.6:free";
}

function buildPrompt(clarification: string, forceReady: boolean) {
  const trimmedClarification = clarification.trim();
  const clarificationLine = trimmedClarification
    ? `The user added this clarification: ${trimmedClarification}`
    : "The user has not provided extra clarification yet.";

  const readyLine = forceReady
    ? "This is a benchmark fixture with a known serving size. Do not ask a clarification question; return status ready."
    : "Ask a clarification question only when food identity or portion size is genuinely impossible to estimate.";

  return [
    "Analyze this food photo for a macro tracker.",
    clarificationLine,
    "Estimate calories, protein, carbs, and fat for the visible edible portion.",
    "If clarification is already provided, use it and return the best estimate.",
    readyLine,
    "Keep notes short and only include assumptions.",
    "Return only the JSON object matching the schema.",
  ].join("\n");
}

function buildOpenRouterRequestBody(params: {
  clarification: string;
  forceReady: boolean;
  imageUrl: string;
  model: string;
  userId: string;
}) {
  const requestBody: Record<string, unknown> = {
    model: params.model,
    messages: [
      {
        role: "system",
        content: FOOD_PHOTO_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildPrompt(params.clarification, params.forceReady),
          },
          {
            type: "image_url",
            image_url: {
              url: params.imageUrl,
            },
          },
        ],
      },
    ],
    user: params.userId,
    provider: {
      allow_fallbacks: true,
    },
    plugins: [
      {
        id: "response-healing",
        enabled: true,
      },
    ],
    response_format: {
      type: "json_object",
    },
  };

  if (supportsGenerationControls(params.model)) {
    requestBody.temperature = 0;
    requestBody.max_tokens = 300;
    requestBody.include_reasoning = false;
    requestBody.reasoning = { enabled: false };
  }

  if (supportsStructuredOutput(params.model)) {
    requestBody.response_format = {
      type: "json_schema",
      json_schema: {
        name: "food_photo_macro_estimate",
        strict: true,
        schema: foodPhotoResponseSchema,
      },
    };
  }

  return requestBody;
}

function createAttemptAbortSignal(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    get parentAborted() {
      return parentSignal?.aborted ?? false;
    },
    cleanup() {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function retryDelay(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, 700 * attempt));
}

function errorMessageFromUnknown(error: unknown) {
  return error instanceof Error ? error.message : "OpenRouter request failed.";
}

function metadataDetail(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const raw = typeof record.raw === "string" ? record.raw.trim() : "";
  const providerName =
    typeof record.provider_name === "string" ? record.provider_name.trim() : "";
  const details = [providerName ? `Provider: ${providerName}` : "", raw]
    .filter(Boolean)
    .join(". ");

  return details || null;
}

export function classifyFoodPhotoFailure(
  error: string,
  statusCode?: number,
): AnalyzeFoodPhotoFailureKind {
  const lower = error.toLowerCase();

  if (
    lower.includes("insufficient_quota") ||
    lower.includes("insufficient funds") ||
    lower.includes("insufficient_funds") ||
    lower.includes("balance is too low") ||
    lower.includes("/billing")
  ) {
    return "provider_quota";
  }

  if (
    lower.includes("free-models-per-min") ||
    lower.includes("rate limit") ||
    lower.includes("rate-limit") ||
    lower.includes("rate limited") ||
    lower.includes("temporarily rate-limited") ||
    statusCode === 429
  ) {
    return "provider_rate_limit";
  }

  if (
    statusCode === 403 &&
    lower.includes("forbidden") &&
    (lower.includes("image") ||
      lower.includes(".jpg") ||
      lower.includes(".jpeg") ||
      lower.includes(".png") ||
      lower.includes(".webp"))
  ) {
    return "provider_image_access";
  }

  if (
    lower.includes("unsupported image") ||
    lower.includes("does not support image") ||
    lower.includes("doesn't support image") ||
    lower.includes("vision is not supported") ||
    lower.includes("not support vision")
  ) {
    return "unsupported_model";
  }

  if (typeof statusCode === "number") {
    return "provider_error";
  }

  return "unknown";
}

function isRetryableOpenRouterError(error: string, statusCode?: number) {
  const lower = error.toLowerCase();
  const kind = classifyFoodPhotoFailure(error, statusCode);

  if (
    kind === "provider_quota" ||
    kind === "provider_image_access" ||
    kind === "unsupported_model"
  ) {
    return false;
  }

  return (
    statusCode === 408 ||
    statusCode === 409 ||
    statusCode === 429 ||
    (typeof statusCode === "number" && statusCode >= 500) ||
    lower.includes("rate-limit") ||
    lower.includes("rate limited") ||
    lower.includes("temporarily") ||
    lower.includes("timeout") ||
    lower.includes("overload") ||
    lower.includes("upstream")
  );
}

function shouldTryNextFoodPhotoModel(result: AnalyzeFoodPhotoResult) {
  if (result.ok) {
    return false;
  }

  if (result.kind === "provider_error") {
    return result.retryable === true;
  }

  return (
    result.retryable === true ||
    result.kind === "empty_response" ||
    result.kind === "invalid_json" ||
    result.kind === "provider_rate_limit" ||
    result.kind === "unsupported_model"
  );
}

async function readOpenRouterError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string; metadata?: unknown };
      message?: string;
      openrouter_metadata?: { summary?: string };
    };
    const message =
      payload.error?.message ??
      payload.message ??
      `OpenRouter request failed with status ${response.status}.`;
    const detail =
      metadataDetail(payload.error?.metadata) ??
      payload.openrouter_metadata?.summary ??
      response.headers.get("x-generation-id");

    return detail ? `${message} (${detail})` : message;
  } catch {
    return `OpenRouter request failed with status ${response.status}.`;
  }
}

export async function analyzeFoodPhoto(params: {
  image?: File;
  imageUrl?: string;
  clarification?: string;
  forceReady?: boolean;
  maxAttempts?: number;
  model?: string;
  modelCallTimeoutMs?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  userId: string;
}): Promise<AnalyzeFoodPhotoResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "OPENROUTER_API_KEY is not configured on the server.",
      kind: "missing_api_key",
    };
  }

  let imageUrl = params.imageUrl?.trim();

  if (imageUrl) {
    if (!imageUrl.startsWith("data:image/")) {
      try {
        const parsedImageUrl = new URL(imageUrl);
        if (parsedImageUrl.protocol !== "https:") {
          return {
            ok: false,
            error: "Benchmark image URLs must use HTTPS or data:image URLs.",
            kind: "invalid_image",
          };
        }
      } catch {
        return {
          ok: false,
          error: "Benchmark image URL is invalid.",
          kind: "invalid_image",
        };
      }
    }
  }

  if (!imageUrl) {
    if (!params.image) {
      return {
        ok: false,
        error: "A food photo is required.",
        kind: "invalid_image",
      };
    }

    if (!SUPPORTED_IMAGE_TYPES.has(params.image.type)) {
      return {
        ok: false,
        error: "Upload a PNG, JPEG, WebP, or GIF image.",
        kind: "invalid_image",
      };
    }

    if (params.image.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: "Image is too large. Use an image under 8 MB.",
        kind: "invalid_image",
      };
    }

    imageUrl = imageBufferToDataUrl(
      await params.image.arrayBuffer(),
      params.image.type,
    );
  }
  const requestedModel = params.model?.trim();
  const models = requestedModel
    ? [requestedModel]
    : getConfiguredFoodPhotoModels();
  const nonFreeModel = models.find((model) => !isFreeOpenRouterModel(model));

  if (nonFreeModel) {
    return {
      ok: false,
      error: `Food photo AI only permits free OpenRouter models. "${nonFreeModel}" is not allowed.`,
      kind: "unsupported_model",
      retryable: false,
    };
  }

  const modelCallTimeoutMs = Math.max(
    1,
    Math.round(params.modelCallTimeoutMs ?? getFoodPhotoModelTimeoutMs()),
  );
  const requestTimeoutMs = Math.max(
    1,
    Math.round(params.requestTimeoutMs ?? DEFAULT_FOOD_PHOTO_REQUEST_TIMEOUT_MS),
  );
  const requestDeadlineMs = performance.now() + requestTimeoutMs;
  const maxAttempts = Math.max(1, params.maxAttempts ?? 1);

  let lastFailure: AnalyzeFoodPhotoResult | null = null;

  for (const [modelIndex, model] of models.entries()) {
    const hasFallbackModel = modelIndex < models.length - 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (params.signal?.aborted) {
        return {
          ok: false,
          error: "The AI request was canceled.",
          kind: "provider_error",
          retryable: false,
        };
      }

      const remainingRequestMs = Math.ceil(
        requestDeadlineMs - performance.now(),
      );
      if (remainingRequestMs <= 0) {
        return {
          ok: false,
          error: `Food photo AI request timed out after ${requestTimeoutMs}ms.`,
          kind: "provider_error",
          retryable: false,
        };
      }

      const attemptTimeoutMs = Math.max(
        1,
        Math.min(modelCallTimeoutMs, remainingRequestMs),
      );
      const attemptUsesRemainingRequestBudget =
        attemptTimeoutMs <= remainingRequestMs &&
        remainingRequestMs <= modelCallTimeoutMs;
      const requestBody = buildOpenRouterRequestBody({
        clarification: params.clarification ?? "",
        forceReady: params.forceReady ?? false,
        imageUrl,
        model,
        userId: params.userId,
      });
      const attemptAbort = createAttemptAbortSignal(
        params.signal,
        attemptTimeoutMs,
      );

      try {
        const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
            "X-OpenRouter-Title": "Macro Tracker",
            "X-OpenRouter-Metadata": "enabled",
          },
          body: JSON.stringify(requestBody),
          signal: attemptAbort.signal,
        });

        if (!response.ok) {
          const error = await readOpenRouterError(response);
          const retryable = isRetryableOpenRouterError(error, response.status);
          lastFailure = {
            ok: false,
            error,
            kind: classifyFoodPhotoFailure(error, response.status),
            statusCode: response.status,
            retryable,
          };

          if (retryable && attempt < maxAttempts) {
            await retryDelay(attempt);
            continue;
          }

          if (hasFallbackModel && shouldTryNextFoodPhotoModel(lastFailure)) {
            break;
          }

          return lastFailure;
        }

        const payload = (await response.json()) as {
          error?: {
            message?: string;
          };
          choices?: Array<{
            finish_reason?: string | null;
            error?: {
              message?: string;
            };
            message?: {
              content?: unknown;
              reasoning?: string | null;
            };
          }>;
        };
        const choice = payload.choices?.[0];

        if (payload.error?.message) {
          const retryable = isRetryableOpenRouterError(payload.error.message);
          lastFailure = {
            ok: false,
            error: payload.error.message,
            kind: classifyFoodPhotoFailure(payload.error.message),
            retryable,
          };
          if (retryable && attempt < maxAttempts) {
            await retryDelay(attempt);
            continue;
          }

          if (hasFallbackModel && shouldTryNextFoodPhotoModel(lastFailure)) {
            break;
          }

          return lastFailure;
        }

        if (choice?.finish_reason === "error") {
          const error =
            choice.error?.message ?? "The AI provider returned an error.";
          const retryable = isRetryableOpenRouterError(error);
          lastFailure = {
            ok: false,
            error,
            kind: classifyFoodPhotoFailure(error),
            retryable,
          };

          if (retryable && attempt < maxAttempts) {
            await retryDelay(attempt);
            continue;
          }

          if (hasFallbackModel && shouldTryNextFoodPhotoModel(lastFailure)) {
            break;
          }

          return lastFailure;
        }

        const content = extractMessageContent(choice?.message?.content);
        const aiResponse =
          content ?? choice?.message?.reasoning ?? safeJsonStringify(payload);

        if (!content) {
          console.error("Food photo AI returned no parseable content.", {
            aiResponse,
          });
          lastFailure = {
            ok: false,
            error: "The AI did not return a response.",
            kind: "empty_response",
            aiResponse,
            retryable: true,
          };

          if (attempt < maxAttempts) {
            await retryDelay(attempt);
            continue;
          }

          if (hasFallbackModel && shouldTryNextFoodPhotoModel(lastFailure)) {
            break;
          }

          return lastFailure;
        }

        try {
          return { ok: true, analysis: parseFoodPhotoAnalysis(content) };
        } catch (error) {
          console.error("Food photo AI response could not be parsed.", {
            error,
            aiResponse: content,
          });
          lastFailure = {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to parse the AI response.",
            kind: "invalid_json",
            aiResponse: content,
            retryable: true,
          };

          if (attempt < maxAttempts) {
            await retryDelay(attempt);
            continue;
          }

          if (hasFallbackModel && shouldTryNextFoodPhotoModel(lastFailure)) {
            break;
          }

          return lastFailure;
        }
      } catch (error) {
        const requestBudgetTimedOut =
          attemptAbort.timedOut && attemptUsesRemainingRequestBudget;
        const retryable =
          !attemptAbort.parentAborted && !requestBudgetTimedOut;
        lastFailure = {
          ok: false,
          error: attemptAbort.parentAborted
            ? "The AI request was canceled."
            : requestBudgetTimedOut
              ? `Food photo AI request timed out after ${requestTimeoutMs}ms.`
              : attemptAbort.timedOut
                ? `OpenRouter request timed out after ${modelCallTimeoutMs}ms.`
                : errorMessageFromUnknown(error),
          kind: "provider_error",
          retryable,
        };

        if (retryable && attempt < maxAttempts) {
          await retryDelay(attempt);
          continue;
        }

        if (hasFallbackModel && shouldTryNextFoodPhotoModel(lastFailure)) {
          break;
        }

        return lastFailure;
      } finally {
        attemptAbort.cleanup();
      }
    }
  }

  return (
    lastFailure ?? {
      ok: false,
      error: "The AI request failed.",
      kind: "unknown",
      retryable: false,
    }
  );
}

export function getConfiguredFoodPhotoModel() {
  return getConfiguredFoodPhotoModels()[0] ?? DEFAULT_FOOD_PHOTO_MODEL;
}
