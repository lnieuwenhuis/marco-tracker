import {
  authenticateApiToken,
  createMealEntry,
  createMealGroup,
  createPersonalFoodProduct,
  createRecipe,
  createTemplate,
  createTemplateFromDate,
  createWeightEntry,
  deleteMealEntry,
  deleteMealGroup,
  deleteRecipe,
  deleteTemplate,
  deleteWeightEntry,
  getDailySummary,
  getLeaderboardStats,
  getMealGroups,
  getPeriodAverages,
  getRecipeById,
  getRecipes,
  getStatsPageData,
  getTemplateById,
  getTemplates,
  getUserById,
  getUserGoals,
  getWeightEntries,
  getWeightGoal,
  getWeightPageData,
  isMealEntryStatus,
  isValidDateString,
  lookupBarcodeFoodProduct,
  MealEntryValidationError,
  markMealEntryStatus,
  applyTemplateToDate,
  RecipeValidationError,
  reorderMealGroups,
  saveUserGoals,
  saveWeightGoal,
  searchFoodProducts,
  todayDateString,
  updateMealEntry,
  updateMealGroup,
  updatePersonalFoodProduct,
  updateRecipe,
  updateTemplate,
  updateWeightEntry,
  type ApiScope,
  type MacroGoals,
  WeightEntryValidationError,
} from "@macro-tracker/db";
import { NextResponse } from "next/server";

import { getApiV1OpenApi } from "./api-v1-openapi";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE" | "OPTIONS";

type ApiContext = {
  request: Request;
  method: ApiMethod;
  path: string[];
  url: URL;
  userId: string;
};

function jsonWithCors(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function ok(data: unknown, status = 200) {
  return jsonWithCors({ ok: true, data }, { status });
}

function emptyOk(data: unknown = {}) {
  return ok(data);
}

function error(status: number, code: string, message: string) {
  return jsonWithCors({ ok: false, error: { code, message } }, { status });
}

function methodNotAllowed() {
  return error(405, "method_not_allowed", "Method is not allowed for this endpoint.");
}

function notFound(message = "API endpoint not found.") {
  return error(404, "not_found", message);
}

function badRequest(message: string) {
  return error(400, "bad_request", message);
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return { ok: false as const, reason: "missing" as const };
  }

  const parts = authorization.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") {
    return { ok: false as const, reason: "malformed" as const };
  }

  return { ok: true as const, token: parts[1]! };
}

function authErrorMessage(reason: "missing" | "malformed" | "invalid" | "expired" | "revoked") {
  switch (reason) {
    case "missing":
      return ["missing_token", "Missing bearer token."] as const;
    case "malformed":
      return ["malformed_token", "Authorization must use Bearer <token>."] as const;
    case "expired":
      return ["expired_token", "API token has expired."] as const;
    case "revoked":
      return ["revoked_token", "API token has been revoked."] as const;
    case "invalid":
    default:
      return ["invalid_token", "API token is invalid."] as const;
  }
}

async function authenticateRequest(request: Request, scopes: ApiScope[]) {
  const bearer = getBearerToken(request);
  if (!bearer.ok) {
    const [code, message] = authErrorMessage(bearer.reason);
    return { ok: false as const, response: error(401, code, message) };
  }

  const auth = await authenticateApiToken(bearer.token);
  if (!auth.ok) {
    const [code, message] = authErrorMessage(auth.reason);
    return { ok: false as const, response: error(401, code, message) };
  }

  const missingScope = scopes.find((scope) => !auth.token.scopes.includes(scope));
  if (missingScope) {
    return {
      ok: false as const,
      response: error(
        403,
        "insufficient_scope",
        `API token is missing required scope: ${missingScope}.`,
      ),
    };
  }

  return { ok: true as const, userId: auth.token.userId };
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function requireDate(value: string | undefined) {
  if (!value || !isValidDateString(value)) {
    throw new Error("Date must use YYYY-MM-DD.");
  }

  return value;
}

function requireRecord(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body is required.");
  }

  return body as Record<string, unknown>;
}

function requireBodyDate(body: unknown) {
  const record = requireRecord(body);
  return {
    ...record,
    date: requireDate(typeof record.date === "string" ? record.date : undefined),
  };
}

function mergeGoalField(
  record: Record<string, unknown>,
  key: keyof MacroGoals,
  currentValue: number | null,
) {
  if (!(key in record)) return currentValue;

  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be null or a finite non-negative number.`);
  }
  if (key === "caloriesKcal" && !Number.isInteger(value)) {
    throw new Error("caloriesKcal must be an integer.");
  }

  return value;
}

function getGoalWeightKg(body: unknown) {
  const record = requireRecord(body);
  if (!("goalWeightKg" in record)) {
    throw new Error("goalWeightKg is required.");
  }

  const value = record.goalWeightKg;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("goalWeightKg must be null or a finite positive number.");
  }
  if (value >= 1000) {
    throw new Error("goalWeightKg must be less than 1000 kg.");
  }

  return Math.round(value * 100) / 100;
}

function getReferenceDate(url: URL) {
  const date = url.searchParams.get("date");
  if (date == null) {
    return todayDateString();
  }
  if (!isValidDateString(date)) {
    throw new Error("Date must use YYYY-MM-DD.");
  }

  return date;
}

function getOrderedGroupIds(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("Request body is required.");
  }

  const record = body as Record<string, unknown>;
  const ids = record.orderedIds ?? record.groupIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new Error("orderedIds must be an array of group IDs.");
  }

  return ids;
}

function mergeGoals(current: MacroGoals, body: unknown): MacroGoals {
  const record = requireRecord(body);
  return {
    caloriesKcal: mergeGoalField(record, "caloriesKcal", current.caloriesKcal),
    proteinG: mergeGoalField(record, "proteinG", current.proteinG),
    carbsG: mergeGoalField(record, "carbsG", current.carbsG),
    fatG: mergeGoalField(record, "fatG", current.fatG),
  };
}

async function logRecipePortion(
  userId: string,
  recipeId: string,
  body: Record<string, unknown>,
) {
  const date = requireDate(typeof body.date === "string" ? body.date : undefined);
  const recipe = await getRecipeById(userId, recipeId);
  if (!recipe) {
    throw new Error("Recipe not found.");
  }

  const portionCount =
    typeof body.portionCount === "number" && Number.isFinite(body.portionCount) && body.portionCount > 0
      ? body.portionCount
      : 1;
  const gramsConsumed =
    typeof body.gramsConsumed === "number" && Number.isFinite(body.gramsConsumed)
      ? body.gramsConsumed
      : null;
  if (gramsConsumed != null && gramsConsumed <= 0) {
    throw new Error("Grams consumed must be greater than 0.");
  }
  if (
    gramsConsumed != null &&
    (recipe.totalCookedWeightG == null || recipe.totalCookedWeightG <= 0)
  ) {
    throw new Error("Recipe cooked weight is required to log grams.");
  }

  const status =
    typeof body.status === "string" && isMealEntryStatus(body.status)
      ? body.status
      : date > todayDateString()
        ? "planned"
        : "eaten";
  const hasGramsConsumed = gramsConsumed != null;
  const factor = hasGramsConsumed
    ? (gramsConsumed / recipe.totalCookedWeightG!) * recipe.portions
    : portionCount;

  return createMealEntry(userId, {
    date,
    status,
    label: hasGramsConsumed
      ? `${recipe.label} (${gramsConsumed}g)`
      : `${recipe.label} (${portionCount} portion${portionCount === 1 ? "" : "s"})`,
    quantity: gramsConsumed ?? portionCount,
    unit: hasGramsConsumed ? "g" : "serving",
    proteinG: Math.round(recipe.perPortionMacros.proteinG * factor * 10) / 10,
    carbsG: Math.round(recipe.perPortionMacros.carbsG * factor * 10) / 10,
    fatG: Math.round(recipe.perPortionMacros.fatG * factor * 10) / 10,
    caloriesKcal: Math.round(recipe.perPortionMacros.caloriesKcal * factor),
  });
}

function mapAccount(user: Awaited<ReturnType<typeof getUserById>>) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    pictureUrl: user.pictureUrl,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    onboardingCompletedAt: user.onboardingCompletedAt,
    preferredWeightUnit: user.preferredWeightUnit,
  };
}

async function dispatchApiRequest(ctx: ApiContext) {
  if (ctx.path.length > 3) return notFound();

  const [resource, id, action] = ctx.path;

  if (resource === "me" && !id) {
    if (ctx.method !== "GET") return methodNotAllowed();
    const [user, goals] = await Promise.all([
      getUserById(ctx.userId),
      getUserGoals(ctx.userId),
    ]);
    return ok({ user: mapAccount(user), goals });
  }

  if (resource === "goals" && !id) {
    if (ctx.method === "GET") {
      return ok(await getUserGoals(ctx.userId));
    }
    if (ctx.method === "PATCH") {
      const current = await getUserGoals(ctx.userId);
      const goals = mergeGoals(current, await readJson(ctx.request));
      await saveUserGoals(ctx.userId, goals);
      return ok(await getUserGoals(ctx.userId));
    }
    return methodNotAllowed();
  }

  if (resource === "days") {
    const date = requireDate(id);
    if (!action && ctx.method === "GET") {
      return ok(await getDailySummary(ctx.userId, date));
    }
    if (action === "entries" && ctx.method === "POST") {
      const body = await readJson(ctx.request);
      return ok(await createMealEntry(ctx.userId, { ...(body as object), date } as never), 201);
    }
    return methodNotAllowed();
  }

  if (resource === "meal-entries" && id) {
    if (!action && ctx.method === "PATCH") {
      return ok(await updateMealEntry(ctx.userId, id, (await readJson(ctx.request)) as never));
    }
    if (!action && ctx.method === "DELETE") {
      const deleted = await deleteMealEntry(ctx.userId, id);
      if (!deleted) return notFound("Meal entry not found.");
      return emptyOk({ deleted: true });
    }
    if (action === "status" && ctx.method === "PATCH") {
      const body = (await readJson(ctx.request)) as Record<string, unknown>;
      if (typeof body.status !== "string" || !isMealEntryStatus(body.status)) {
        return badRequest("Meal status is invalid.");
      }
      return ok(await markMealEntryStatus(ctx.userId, id, body.status));
    }
    return methodNotAllowed();
  }

  if (resource === "meal-groups") {
    if (!id && ctx.method === "GET") {
      return ok(await getMealGroups(ctx.userId));
    }
    if (!id && ctx.method === "POST") {
      return ok(await createMealGroup(ctx.userId, (await readJson(ctx.request)) as never), 201);
    }
    if (id === "reorder" && !action && ctx.method === "POST") {
      return ok(await reorderMealGroups(ctx.userId, getOrderedGroupIds(await readJson(ctx.request))));
    }
    if (id && !action && ctx.method === "PATCH") {
      return ok(await updateMealGroup(ctx.userId, id, (await readJson(ctx.request)) as never));
    }
    if (id && !action && ctx.method === "DELETE") {
      const deleted = await deleteMealGroup(ctx.userId, id);
      if (!deleted) return notFound("Meal group not found.");
      return emptyOk({ deleted: true });
    }
    return methodNotAllowed();
  }

  if (resource === "foods") {
    if (id === "search" && !action && ctx.method === "GET") {
      return ok(await searchFoodProducts(ctx.userId, ctx.url.searchParams.get("q") ?? ""));
    }
    if (!id && ctx.method === "POST") {
      return ok(await createPersonalFoodProduct(ctx.userId, (await readJson(ctx.request)) as never), 201);
    }
    if (id && !action && ctx.method === "PATCH") {
      return ok(await updatePersonalFoodProduct(ctx.userId, id, (await readJson(ctx.request)) as never));
    }
    return methodNotAllowed();
  }

  if (resource === "barcodes" && id && !action) {
    if (ctx.method !== "GET") return methodNotAllowed();
    return ok(await lookupBarcodeFoodProduct(decodeURIComponent(id)));
  }

  if (resource === "templates") {
    if (id === "from-day" && !action && ctx.method === "POST") {
      return ok(await createTemplateFromDate(ctx.userId, requireBodyDate(await readJson(ctx.request)) as never), 201);
    }
    if (!id && ctx.method === "GET") {
      return ok(await getTemplates(ctx.userId));
    }
    if (!id && ctx.method === "POST") {
      return ok(await createTemplate(ctx.userId, (await readJson(ctx.request)) as never), 201);
    }
    if (id && action === "apply" && ctx.method === "POST") {
      return ok(await applyTemplateToDate(ctx.userId, { templateId: id, ...requireBodyDate(await readJson(ctx.request)) } as never), 201);
    }
    if (id && !action && ctx.method === "GET") {
      const template = await getTemplateById(ctx.userId, id);
      if (!template) return notFound("Template not found.");
      return ok(template);
    }
    if (id && !action && ctx.method === "PATCH") {
      return ok(await updateTemplate(ctx.userId, id, (await readJson(ctx.request)) as never));
    }
    if (id && !action && ctx.method === "DELETE") {
      const deleted = await deleteTemplate(ctx.userId, id);
      if (!deleted) return notFound("Template not found.");
      return emptyOk({ deleted: true });
    }
    return methodNotAllowed();
  }

  if (resource === "recipes") {
    if (!id && ctx.method === "GET") {
      return ok(await getRecipes(ctx.userId));
    }
    if (!id && ctx.method === "POST") {
      return ok(await createRecipe(ctx.userId, (await readJson(ctx.request)) as never), 201);
    }
    if (id && action === "log" && ctx.method === "POST") {
      return ok(await logRecipePortion(ctx.userId, id, (await readJson(ctx.request)) as Record<string, unknown>), 201);
    }
    if (id && !action && ctx.method === "GET") {
      const recipe = await getRecipeById(ctx.userId, id);
      if (!recipe) return notFound("Recipe not found.");
      return ok(recipe);
    }
    if (id && !action && ctx.method === "PATCH") {
      return ok(await updateRecipe(ctx.userId, id, (await readJson(ctx.request)) as never));
    }
    if (id && !action && ctx.method === "DELETE") {
      const deleted = await deleteRecipe(ctx.userId, id);
      if (!deleted) return notFound("Recipe not found.");
      return emptyOk({ deleted: true });
    }
    return methodNotAllowed();
  }

  if (resource === "weight") {
    if (!id && ctx.method === "GET") {
      return ok(await getWeightPageData(ctx.userId, getReferenceDate(ctx.url)));
    }
    if (id === "entries" && !action && ctx.method === "POST") {
      return ok(await createWeightEntry(ctx.userId, requireBodyDate(await readJson(ctx.request)) as never), 201);
    }
    if (id === "entries" && action && ctx.method === "PATCH") {
      const updated = await updateWeightEntry(ctx.userId, action, requireBodyDate(await readJson(ctx.request)) as never);
      if (!updated) return notFound("Weight entry not found.");
      return ok(updated);
    }
    if (id === "entries" && action && ctx.method === "DELETE") {
      const deleted = await deleteWeightEntry(ctx.userId, action);
      if (!deleted) return notFound("Weight entry not found.");
      return emptyOk({ deleted: true });
    }
    if (id === "goal" && !action && ctx.method === "GET") {
      return ok({ goalWeightKg: await getWeightGoal(ctx.userId) });
    }
    if (id === "goal" && !action && ctx.method === "PATCH") {
      await saveWeightGoal(ctx.userId, getGoalWeightKg(await readJson(ctx.request)));
      return ok({ goalWeightKg: await getWeightGoal(ctx.userId) });
    }
    if (id === "entries" && !action && ctx.method === "GET") {
      return ok(await getWeightEntries(ctx.userId));
    }
    return methodNotAllowed();
  }

  if (resource === "stats" && !id) {
    if (ctx.method !== "GET") return methodNotAllowed();
    return ok(await getStatsPageData(ctx.userId, getReferenceDate(ctx.url)));
  }

  if (resource === "summary" && !id) {
    if (ctx.method !== "GET") return methodNotAllowed();
    const date = getReferenceDate(ctx.url);
    const [dailySummary, periodAverages, goals, stats] = await Promise.all([
      getDailySummary(ctx.userId, date),
      getPeriodAverages(ctx.userId, date),
      getUserGoals(ctx.userId),
      getStatsPageData(ctx.userId, date),
    ]);
    return ok({ date, dailySummary, periodAverages, goals, stats });
  }

  if (resource === "leaderboard" && !id) {
    if (ctx.method !== "GET") return methodNotAllowed();
    return ok(await getLeaderboardStats(ctx.userId, getReferenceDate(ctx.url)));
  }

  return notFound();
}

function scopesFor(method: ApiMethod, path: string[]): ApiScope[] | null {
  if (path.length > 3) return null;

  const [resource, id, action] = path;
  if (resource === "openapi.json" && !id && method === "GET") return [];
  if (resource === "me" && !id && method === "GET") return ["read:goals"];
  if (resource === "goals" && !id) {
    if (method === "GET") return ["read:goals"];
    if (method === "PATCH") return ["write:goals"];
  }
  if (resource === "days" && id) {
    if (!action && method === "GET") return ["read:daily"];
    if (action === "entries" && method === "POST") return ["write:daily"];
  }
  if (resource === "meal-entries" && id) {
    if ((!action && (method === "PATCH" || method === "DELETE")) || (action === "status" && method === "PATCH")) {
      return ["write:daily"];
    }
  }
  if (resource === "meal-groups") {
    if (!id && method === "GET") return ["read:daily"];
    if ((!id && method === "POST") || (id === "reorder" && !action && method === "POST")) return ["write:daily"];
    if (id && !action && (method === "PATCH" || method === "DELETE")) return ["write:daily"];
  }
  if (resource === "foods") {
    if (id === "search" && !action && method === "GET") return ["read:foods"];
    if ((!id && method === "POST") || (id && !action && method === "PATCH")) return ["write:foods"];
  }
  if (resource === "barcodes" && id && !action && method === "GET") return ["read:foods"];
  if (resource === "templates") {
    if (id === "from-day" && !action && method === "POST") return ["read:daily", "write:templates"];
    if (!id && method === "GET") return ["read:templates"];
    if (!id && method === "POST") return ["write:templates"];
    if (id && action === "apply" && method === "POST") return ["read:templates", "write:daily"];
    if (id && !action && method === "GET") return ["read:templates"];
    if (id && !action && (method === "PATCH" || method === "DELETE")) return ["write:templates"];
  }
  if (resource === "recipes") {
    if (!id && method === "GET") return ["read:recipes"];
    if (!id && method === "POST") return ["write:recipes"];
    if (id && action === "log" && method === "POST") return ["read:recipes", "write:daily"];
    if (id && !action && method === "GET") return ["read:recipes"];
    if (id && !action && (method === "PATCH" || method === "DELETE")) return ["write:recipes"];
  }
  if (resource === "weight") {
    if ((!id && method === "GET") || (id === "goal" && !action && method === "GET") || (id === "entries" && !action && method === "GET")) {
      return ["read:weight"];
    }
    if ((id === "entries" && !action && method === "POST") || (id === "entries" && action && (method === "PATCH" || method === "DELETE")) || (id === "goal" && !action && method === "PATCH")) {
      return ["write:weight"];
    }
  }
  if (resource === "summary" && !id && method === "GET") {
    return ["read:stats", "read:daily", "read:goals"];
  }
  if ((resource === "stats" || resource === "leaderboard") && !id && method === "GET") {
    return ["read:stats"];
  }
  return null;
}

function isKnownApiPath(path: string[]) {
  if (path.length > 3) return false;

  const [resource, id, action] = path;
  if (resource === "openapi.json" && !id) return true;
  if ((resource === "me" || resource === "goals") && !id) return true;
  if (resource === "days" && id) return !action || action === "entries";
  if (resource === "meal-entries" && id) return !action || action === "status";
  if (resource === "meal-groups") {
    return !id || (id === "reorder" && !action) || Boolean(id && !action);
  }
  if (resource === "foods") {
    return !id || (id === "search" && !action) || Boolean(id && !action);
  }
  if (resource === "barcodes" && id && !action) return true;
  if (resource === "templates") {
    return (
      !id ||
      (id === "from-day" && !action) ||
      Boolean(id && action === "apply") ||
      Boolean(id && !action)
    );
  }
  if (resource === "recipes") {
    return !id || Boolean(id && action === "log") || Boolean(id && !action);
  }
  if (resource === "weight") {
    return !id || (id === "entries" && (!action || Boolean(action))) || (id === "goal" && !action);
  }
  if ((resource === "summary" || resource === "stats" || resource === "leaderboard") && !id) {
    return true;
  }

  return false;
}

const SAFE_BAD_REQUEST_MESSAGES = new Set([
  "Request body must be valid JSON.",
  "Date must use YYYY-MM-DD.",
  "Request body is required.",
  "caloriesKcal must be an integer.",
  "goalWeightKg is required.",
  "goalWeightKg must be null or a finite positive number.",
  "goalWeightKg must be less than 1000 kg.",
  "orderedIds must be an array of group IDs.",
  "Grams consumed must be greater than 0.",
  "Recipe cooked weight is required to log grams.",
]);

function isPublicValidationError(caught: unknown, message: string) {
  if (
    caught instanceof MealEntryValidationError ||
    caught instanceof RecipeValidationError ||
    caught instanceof WeightEntryValidationError
  ) {
    return true;
  }

  return (
    SAFE_BAD_REQUEST_MESSAGES.has(message) ||
    /^(caloriesKcal|proteinG|carbsG|fatG) must be null or a finite non-negative number\.$/.test(message)
  );
}

function responseForUnknownError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "Something went wrong.";
  if (message.toLowerCase().includes("not found")) {
    return notFound(message);
  }
  if (isPublicValidationError(caught, message)) {
    return badRequest(message);
  }

  console.error("Unexpected API v1 error", caught);
  return badRequest("Request could not be processed.");
}

export async function handleApiV1Request(
  request: Request,
  path: string[] | undefined,
  method = request.method,
) {
  const normalizedMethod = method.toUpperCase() as ApiMethod;
  const normalizedPath = path ?? [];

  if (normalizedMethod === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (normalizedPath[0] === "openapi.json" && normalizedPath.length === 1) {
    if (normalizedMethod !== "GET") return methodNotAllowed();
    return ok(getApiV1OpenApi());
  }

  const requiredScopes = scopesFor(normalizedMethod, normalizedPath);
  if (!requiredScopes) {
    return isKnownApiPath(normalizedPath) ? methodNotAllowed() : notFound();
  }

  const auth = await authenticateRequest(request, requiredScopes);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    return await dispatchApiRequest({
      request,
      method: normalizedMethod,
      path: normalizedPath,
      url: new URL(request.url),
      userId: auth.userId,
    });
  } catch (caught) {
    return responseForUnknownError(caught);
  }
}
