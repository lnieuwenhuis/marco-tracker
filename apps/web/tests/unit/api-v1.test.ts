import {
  createApiToken,
  getApiScopes,
  revokeApiToken,
  setDatabaseRuntimeForTesting,
  upsertUserFromShooProfile,
  type DatabaseRuntime,
} from "@macro-tracker/db";
import { createTestDatabase } from "@macro-tracker/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleApiV1Request } from "@/lib/api-v1";
import { API_V1_ENDPOINTS, getApiV1OpenApi } from "@/lib/api-v1-openapi";

describe("Macro Tracker API v1", () => {
  let runtime: DatabaseRuntime;
  let userId: string;
  let fullToken: string;

  beforeEach(async () => {
    runtime = await createTestDatabase();
    setDatabaseRuntimeForTesting(runtime);
    const user = await upsertUserFromShooProfile(
      {
        pairwiseSub: "api-user",
        email: "api@example.com",
        displayName: "API User",
      },
      runtime.db,
    );
    userId = user.id;
    fullToken = (
      await createApiToken(
        userId,
        {
          name: "Full API",
          scopes: getApiScopes(),
        },
        runtime.db,
      )
    ).token;
  });

  afterEach(async () => {
    setDatabaseRuntimeForTesting();
    await runtime.close();
  });

  async function apiRequest(
    method: string,
    path: string,
    options: {
      token?: string;
      body?: unknown;
      rawBody?: string;
    } = {},
  ) {
    const headers: Record<string, string> = {};
    if (options.token) {
      headers.authorization = `Bearer ${options.token}`;
    }
    if (options.body !== undefined || options.rawBody !== undefined) {
      headers["content-type"] = "application/json";
    }

    const url = new URL(`http://localhost/api/v1${path}`);

    return handleApiV1Request(
      new Request(url, {
        method,
        headers,
        body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      }),
      url.pathname.replace("/api/v1", "").split("/").filter(Boolean),
      method,
    );
  }

  it("returns CORS preflight headers for API v1 paths", async () => {
    const response = await apiRequest("OPTIONS", "/days/2026-03-19");

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("returns consistent auth and scope errors", async () => {
    const missing = await apiRequest("GET", "/goals");
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "missing_token" },
    });

    const malformed = await handleApiV1Request(
      new Request("http://localhost/api/v1/goals", {
        headers: { authorization: "Token nope" },
      }),
      ["goals"],
      "GET",
    );
    expect(malformed.status).toBe(401);
    await expect(malformed.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "malformed_token" },
    });

    const expired = await createApiToken(
      userId,
      {
        name: "Expired",
        scopes: ["read:goals"],
        expiresAt: new Date(Date.now() - 60_000),
      },
      runtime.db,
    );
    const expiredResponse = await apiRequest("GET", "/goals", {
      token: expired.token,
    });
    expect(expiredResponse.status).toBe(401);
    await expect(expiredResponse.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "expired_token" },
    });

    const revoked = await createApiToken(
      userId,
      {
        name: "Revoked",
        scopes: ["read:goals"],
      },
      runtime.db,
    );
    await revokeApiToken(userId, revoked.record.id, runtime.db);
    const revokedResponse = await apiRequest("GET", "/goals", {
      token: revoked.token,
    });
    expect(revokedResponse.status).toBe(401);
    await expect(revokedResponse.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "revoked_token" },
    });

    const goalsOnly = await createApiToken(
      userId,
      {
        name: "Goals",
        scopes: ["read:goals"],
      },
      runtime.db,
    );
    const insufficient = await apiRequest("GET", "/days/2026-03-19", {
      token: goalsOnly.token,
    });
    expect(insufficient.status).toBe(403);
    await expect(insufficient.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "insufficient_scope" },
    });
  });

  it("requires every scope represented by summary data", async () => {
    await apiRequest("PATCH", "/goals", {
      token: fullToken,
      body: { caloriesKcal: 2400, proteinG: 150 },
    });
    const groupResponse = await apiRequest("POST", "/meal-groups", {
      token: fullToken,
      body: { label: "Dinner" },
    });
    const group = (await groupResponse.json()).data;
    await apiRequest("POST", "/days/2026-03-19/entries", {
      token: fullToken,
      body: {
        mealGroupId: group.id,
        label: "Private dinner",
        quantity: 1,
        unit: "serving",
        proteinG: 20,
        carbsG: 30,
        fatG: 10,
        caloriesKcal: 300,
      },
    });

    const statsOnly = await createApiToken(
      userId,
      {
        name: "Stats only",
        scopes: ["read:stats"],
      },
      runtime.db,
    );
    const response = await apiRequest("GET", "/summary?date=2026-03-19", {
      token: statsOnly.token,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "insufficient_scope" },
    });
  });

  it("rejects invalid goal patches without persisting partial changes", async () => {
    const initial = {
      caloriesKcal: 2400,
      proteinG: 150,
      carbsG: 260,
      fatG: 80,
    };
    await apiRequest("PATCH", "/goals", { token: fullToken, body: initial });

    for (const body of [
      { proteinG: -50 },
      { caloriesKcal: -1 },
      { caloriesKcal: 2100.5 },
      { carbsG: "260" },
    ]) {
      const response = await apiRequest("PATCH", "/goals", { token: fullToken, body });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ ok: false });
    }

    const malformed = await apiRequest("PATCH", "/goals", {
      token: fullToken,
      rawBody: "{\"proteinG\":NaN}",
    });
    expect(malformed.status).toBe(400);

    const unchanged = await apiRequest("GET", "/goals", { token: fullToken });
    await expect(unchanged.json()).resolves.toMatchObject({
      ok: true,
      data: initial,
    });

    const omittedAndNull = await apiRequest("PATCH", "/goals", {
      token: fullToken,
      body: { proteinG: null },
    });
    await expect(omittedAndNull.json()).resolves.toMatchObject({
      ok: true,
      data: { ...initial, proteinG: null },
    });
  });

  it("rejects invalid weight goals and only clears explicit null", async () => {
    await apiRequest("PATCH", "/weight/goal", {
      token: fullToken,
      body: { goalWeightKg: 78 },
    });

    for (const body of [
      {},
      { goalWeightKg: "78" },
      { goalWeightKg: -1 },
      { goalWeightKg: 0 },
    ]) {
      const response = await apiRequest("PATCH", "/weight/goal", { token: fullToken, body });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ ok: false });
    }

    const malformed = await apiRequest("PATCH", "/weight/goal", {
      token: fullToken,
      rawBody: "{\"goalWeightKg\":NaN}",
    });
    expect(malformed.status).toBe(400);

    const stillSet = await apiRequest("GET", "/weight/goal", { token: fullToken });
    await expect(stillSet.json()).resolves.toMatchObject({
      ok: true,
      data: { goalWeightKg: 78 },
    });

    const cleared = await apiRequest("PATCH", "/weight/goal", {
      token: fullToken,
      body: { goalWeightKg: null },
    });
    await expect(cleared.json()).resolves.toMatchObject({
      ok: true,
      data: { goalWeightKg: null },
    });
  });

  it("rejects routes with unexpected trailing path segments", async () => {
    const response = await apiRequest("GET", "/foods/search/extra?q=yogurt", {
      token: fullToken,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("reads and writes representative user-owned objects", async () => {
    const goals = await apiRequest("PATCH", "/goals", {
      token: fullToken,
      body: {
        caloriesKcal: 2400,
        proteinG: 150,
        carbsG: 260,
        fatG: 80,
      },
    });
    expect(goals.status).toBe(200);
    await expect(goals.json()).resolves.toMatchObject({
      ok: true,
      data: { caloriesKcal: 2400, proteinG: 150 },
    });

    const me = await apiRequest("GET", "/me", { token: fullToken });
    await expect(me.json()).resolves.toMatchObject({
      ok: true,
      data: {
        user: {
          id: userId,
          email: "api@example.com",
        },
      },
    });

    const initialGroups = await apiRequest("GET", "/meal-groups", {
      token: fullToken,
    });
    const groupData = await initialGroups.json();
    expect(groupData.data).toHaveLength(4);

    const groupResponse = await apiRequest("POST", "/meal-groups", {
      token: fullToken,
      body: { label: "Pre-workout" },
    });
    const customGroup = (await groupResponse.json()).data;
    expect(customGroup.label).toBe("Pre-workout");

    const reordered = await apiRequest("POST", "/meal-groups/reorder", {
      token: fullToken,
      body: {
        orderedIds: [customGroup.id, ...groupData.data.map((group: { id: string }) => group.id)],
      },
    });
    expect(reordered.status).toBe(200);

    const foodResponse = await apiRequest("POST", "/foods", {
      token: fullToken,
      body: {
        name: "Greek yogurt",
        brand: "Macro Dairy",
        defaultServingQuantity: 170,
        defaultServingUnit: "g",
        proteinPer100: 10,
        carbsPer100: 4,
        fatPer100: 0,
        caloriesPer100: 59,
        servingWeightG: 170,
      },
    });
    const food = (await foodResponse.json()).data;
    expect(food.name).toBe("Greek yogurt");

    const updatedFood = await apiRequest("PATCH", `/foods/${food.id}`, {
      token: fullToken,
      body: {
        ...food,
        name: "Greek yogurt 0%",
      },
    });
    expect((await updatedFood.json()).data.name).toBe("Greek yogurt 0%");

    const search = await apiRequest("GET", "/foods/search?q=yogurt", {
      token: fullToken,
    });
    expect((await search.json()).data[0].id).toBe(food.id);

    const barcodeFood = await apiRequest("POST", "/barcode-foods", {
      token: fullToken,
      body: {
        barcode: "123456789",
        name: "Barcode oats",
        brands: "Macro Mill",
        proteinG: 13,
        carbsG: 68,
        fatG: 7,
        caloriesKcal: 389,
        servingSizeG: 100,
      },
    });
    expect(barcodeFood.status).toBe(201);
    const barcodeLookup = await apiRequest("GET", "/barcodes/123456789", {
      token: fullToken,
    });
    expect((await barcodeLookup.json()).data.name).toBe("Barcode oats");

    const entryResponse = await apiRequest("POST", "/days/2026-03-19/entries", {
      token: fullToken,
      body: {
        mealGroupId: customGroup.id,
        productId: food.id,
        label: "",
        quantity: 170,
        unit: "g",
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        caloriesKcal: 1,
      },
    });
    const entry = (await entryResponse.json()).data;
    expect(entry.label).toContain("Greek yogurt");
    expect(entry.proteinG).toBe(17);

    const updatedEntry = await apiRequest("PATCH", `/meal-entries/${entry.id}`, {
      token: fullToken,
      body: {
        ...entry,
        label: "Yogurt bowl",
      },
    });
    expect((await updatedEntry.json()).data.label).toBe("Yogurt bowl");

    const statusResponse = await apiRequest("PATCH", `/meal-entries/${entry.id}/status`, {
      token: fullToken,
      body: { status: "planned" },
    });
    expect((await statusResponse.json()).data.status).toBe("planned");

    const day = await apiRequest("GET", "/days/2026-03-19", {
      token: fullToken,
    });
    expect((await day.json()).data.meals).toHaveLength(1);

    const templateFromDay = await apiRequest("POST", "/templates/from-day", {
      token: fullToken,
      body: {
        date: "2026-03-19",
        type: "day",
        label: "Training day",
      },
    });
    const template = (await templateFromDay.json()).data;
    expect(template.items).toHaveLength(1);

    const applied = await apiRequest("POST", `/templates/${template.id}/apply`, {
      token: fullToken,
      body: {
        date: "2026-03-20",
        status: "planned",
      },
    });
    expect((await applied.json()).data[0].date).toBe("2026-03-20");

    const recipeResponse = await apiRequest("POST", "/recipes", {
      token: fullToken,
      body: {
        label: "Yogurt oats",
        portions: 2,
        totalCookedWeightG: 500,
        ingredients: [
          {
            productId: food.id,
            label: "Yogurt",
            quantity: 200,
            unit: "g",
            proteinG: 20,
            carbsG: 8,
            fatG: 0,
            caloriesKcal: 118,
          },
        ],
      },
    });
    const recipe = (await recipeResponse.json()).data;
    expect(recipe.perPortionMacros.proteinG).toBe(10);

    const logRecipe = await apiRequest("POST", `/recipes/${recipe.id}/log`, {
      token: fullToken,
      body: {
        date: "2026-03-21",
        portionCount: 1.5,
      },
    });
    expect((await logRecipe.json()).data.label).toContain("Yogurt oats");

    const weight = await apiRequest("POST", "/weight/entries", {
      token: fullToken,
      body: {
        date: "2026-03-19",
        weightKg: 80.25,
        bodyFatPct: null,
        notes: "Morning",
      },
    });
    const weightEntry = (await weight.json()).data;
    expect(weightEntry.weightKg).toBe(80.25);

    const updatedWeight = await apiRequest("PATCH", `/weight/entries/${weightEntry.id}`, {
      token: fullToken,
      body: {
        date: "2026-03-19",
        weightKg: 80,
        bodyFatPct: null,
        notes: "Adjusted",
      },
    });
    expect((await updatedWeight.json()).data.weightKg).toBe(80);

    const weightGoal = await apiRequest("PATCH", "/weight/goal", {
      token: fullToken,
      body: { goalWeightKg: 78 },
    });
    expect((await weightGoal.json()).data.goalWeightKg).toBe(78);

    for (const path of [
      "/weight?date=2026-03-19",
      "/stats?date=2026-03-21",
      "/summary?date=2026-03-21",
      "/leaderboard?date=2026-03-21",
      "/templates",
      "/recipes",
    ]) {
      const response = await apiRequest("GET", path, { token: fullToken });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ ok: true });
    }
  });

  it("publishes OpenAPI for every shipped endpoint with scopes", async () => {
    const response = await apiRequest("GET", "/openapi.json");
    const payload = await response.json();
    const openApi = getApiV1OpenApi();

    expect(response.status).toBe(200);
    expect(payload.data.paths).toEqual(openApi.paths);
    expect(payload.data.servers).toEqual([{ url: "/api/v1" }]);
    expect(Object.keys(payload.data.paths)).toContain("/goals");
    expect(Object.keys(payload.data.paths)).not.toContain("/api/v1/goals");

    for (const endpoint of API_V1_ENDPOINTS) {
      expect(payload.data.paths[endpoint.path]).toBeTruthy();
      for (const method of endpoint.methods) {
        expect(payload.data.paths[endpoint.path][method.method]).toMatchObject({
          summary: method.summary,
          security: method.scopes.length
            ? [{ bearerAuth: method.scopes }]
            : [],
        });
      }
    }
  });
});
