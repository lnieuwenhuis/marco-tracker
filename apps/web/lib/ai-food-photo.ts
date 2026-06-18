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

export type AnalyzeFoodPhotoResult =
  | { ok: true; analysis: FoodPhotoAnalysis }
  | { ok: false; error: string; statusCode?: number; aiResponse?: string };

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_FOOD_PHOTO_MODEL =
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const FOOD_PHOTO_SYSTEM_PROMPT = [
  "You are a food photo nutrition estimator for a macro tracking app.",
  "You must return exactly one JSON object and no other text.",
  "Do not wrap the JSON in markdown fences.",
  "Do not include reasoning, analysis, commentary, apologies, or explanations outside the JSON.",
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

function buildPrompt(clarification: string) {
  const trimmedClarification = clarification.trim();
  const clarificationLine = trimmedClarification
    ? `The user added this clarification: ${trimmedClarification}`
    : "The user has not provided extra clarification yet.";

  return [
    "Analyze this food photo for a macro tracker.",
    clarificationLine,
    "Estimate calories, protein, carbs, and fat for the visible edible portion.",
    "If clarification is already provided, use it and return the best estimate.",
    "Keep notes short and only include assumptions.",
  ].join("\n");
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
  image: File;
  clarification?: string;
  model?: string;
  userId: string;
}): Promise<AnalyzeFoodPhotoResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "OPENROUTER_API_KEY is not configured on the server.",
    };
  }

  if (!SUPPORTED_IMAGE_TYPES.has(params.image.type)) {
    return {
      ok: false,
      error: "Upload a PNG, JPEG, WebP, or GIF image.",
    };
  }

  if (params.image.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: "Image is too large. Use an image under 8 MB.",
    };
  }

  const imageDataUrl = imageBufferToDataUrl(
    await params.image.arrayBuffer(),
    params.image.type,
  );
  const model = params.model?.trim() || getConfiguredFoodPhotoModel();
  const requestBody: Record<string, unknown> = {
    model,
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
            text: buildPrompt(params.clarification ?? ""),
          },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl,
            },
          },
        ],
      },
    ],
    user: params.userId,
  };

  if (supportsGenerationControls(model)) {
    requestBody.temperature = 0;
    requestBody.max_tokens = 600;
    requestBody.include_reasoning = false;
    requestBody.reasoning = { enabled: false };
  }

  if (supportsStructuredOutput(model)) {
    requestBody.response_format = {
      type: "json_schema",
      json_schema: {
        name: "food_photo_macro_estimate",
        strict: true,
        schema: foodPhotoResponseSchema,
      },
    };
  }

  const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
      "X-OpenRouter-Title": "Macro Tracker",
      "X-OpenRouter-Experimental-Metadata": "enabled",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    return {
      ok: false,
      error: await readOpenRouterError(response),
      statusCode: response.status,
    };
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
        content?: string | null;
        reasoning?: string | null;
      };
    }>;
  };
  const choice = payload.choices?.[0];

  if (payload.error?.message) {
    return { ok: false, error: payload.error.message };
  }

  if (choice?.finish_reason === "error") {
    return {
      ok: false,
      error: choice.error?.message ?? "The AI provider returned an error.",
    };
  }

  const content = choice?.message?.content;
  const aiResponse =
    content ?? choice?.message?.reasoning ?? safeJsonStringify(payload);

  if (!content) {
    console.error("Food photo AI returned no parseable content.", {
      aiResponse,
    });
    return {
      ok: false,
      error: "The AI did not return a response.",
      aiResponse,
    };
  }

  try {
    return { ok: true, analysis: parseFoodPhotoAnalysis(content) };
  } catch (error) {
    console.error("Food photo AI response could not be parsed.", {
      error,
      aiResponse: content,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to parse the AI response.",
      aiResponse: content,
    };
  }
}

export function getConfiguredFoodPhotoModel() {
  return process.env.OPENROUTER_MODEL ?? DEFAULT_FOOD_PHOTO_MODEL;
}
