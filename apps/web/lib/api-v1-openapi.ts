import { API_SCOPE_VALUES, type ApiScope } from "@macro-tracker/db";

type ApiEndpointMethod = {
  method: "get" | "post" | "patch" | "delete";
  summary: string;
  scopes: ApiScope[];
  successStatus?: 200 | 201;
};

type ApiEndpoint = {
  path: string;
  methods: ApiEndpointMethod[];
};

export const API_V1_ENDPOINTS: ApiEndpoint[] = [
  {
    path: "/me",
    methods: [{ method: "get", summary: "Read the authenticated account and goals", scopes: ["read:account", "read:goals"] }],
  },
  {
    path: "/goals",
    methods: [
      { method: "get", summary: "Read macro goals", scopes: ["read:goals"] },
      { method: "patch", summary: "Update macro goals", scopes: ["write:goals"] },
    ],
  },
  {
    path: "/days/{date}",
    methods: [{ method: "get", summary: "Read a daily log", scopes: ["read:daily"] }],
  },
  {
    path: "/days/{date}/entries",
    methods: [{ method: "post", summary: "Create a meal entry on a date", scopes: ["write:daily"], successStatus: 201 }],
  },
  {
    path: "/meal-entries/{id}",
    methods: [
      { method: "patch", summary: "Update a meal entry", scopes: ["write:daily"] },
      { method: "delete", summary: "Delete a meal entry", scopes: ["write:daily"] },
    ],
  },
  {
    path: "/meal-entries/{id}/status",
    methods: [{ method: "patch", summary: "Update a meal entry status", scopes: ["write:daily"] }],
  },
  {
    path: "/meal-groups",
    methods: [
      { method: "get", summary: "List meal groups", scopes: ["read:daily"] },
      { method: "post", summary: "Create a meal group", scopes: ["write:daily"], successStatus: 201 },
    ],
  },
  {
    path: "/meal-groups/{id}",
    methods: [
      { method: "patch", summary: "Update a meal group", scopes: ["write:daily"] },
      { method: "delete", summary: "Delete a meal group", scopes: ["write:daily"] },
    ],
  },
  {
    path: "/meal-groups/reorder",
    methods: [{ method: "post", summary: "Reorder meal groups", scopes: ["write:daily"] }],
  },
  {
    path: "/foods/search",
    methods: [{ method: "get", summary: "Search food products", scopes: ["read:foods"] }],
  },
  {
    path: "/foods",
    methods: [{ method: "post", summary: "Create a personal food product", scopes: ["write:foods"], successStatus: 201 }],
  },
  {
    path: "/foods/{id}",
    methods: [{ method: "patch", summary: "Update a personal food product", scopes: ["write:foods"] }],
  },
  {
    path: "/barcodes/{barcode}",
    methods: [{ method: "get", summary: "Lookup a barcode food product", scopes: ["read:foods"] }],
  },
  {
    path: "/templates",
    methods: [
      { method: "get", summary: "List meal templates", scopes: ["read:templates"] },
      { method: "post", summary: "Create a meal template", scopes: ["write:templates"], successStatus: 201 },
    ],
  },
  {
    path: "/templates/{id}",
    methods: [
      { method: "get", summary: "Read a meal template", scopes: ["read:templates"] },
      { method: "patch", summary: "Update a meal template", scopes: ["write:templates"] },
      { method: "delete", summary: "Delete a meal template", scopes: ["write:templates"] },
    ],
  },
  {
    path: "/templates/{id}/apply",
    methods: [{ method: "post", summary: "Apply a template to a date", scopes: ["read:templates", "write:daily"], successStatus: 201 }],
  },
  {
    path: "/templates/from-day",
    methods: [{ method: "post", summary: "Create a template from a day", scopes: ["read:daily", "write:templates"], successStatus: 201 }],
  },
  {
    path: "/recipes",
    methods: [
      { method: "get", summary: "List recipes", scopes: ["read:recipes"] },
      { method: "post", summary: "Create a recipe", scopes: ["write:recipes"], successStatus: 201 },
    ],
  },
  {
    path: "/recipes/{id}",
    methods: [
      { method: "get", summary: "Read a recipe", scopes: ["read:recipes"] },
      { method: "patch", summary: "Update a recipe", scopes: ["write:recipes"] },
      { method: "delete", summary: "Delete a recipe", scopes: ["write:recipes"] },
    ],
  },
  {
    path: "/recipes/{id}/log",
    methods: [{ method: "post", summary: "Log a recipe portion", scopes: ["read:recipes", "write:daily"], successStatus: 201 }],
  },
  {
    path: "/weight",
    methods: [{ method: "get", summary: "Read weight entries and progress", scopes: ["read:weight"] }],
  },
  {
    path: "/weight/entries",
    methods: [
      { method: "get", summary: "List weight entries", scopes: ["read:weight"] },
      { method: "post", summary: "Create a weight entry", scopes: ["write:weight"], successStatus: 201 },
    ],
  },
  {
    path: "/weight/entries/{id}",
    methods: [
      { method: "patch", summary: "Update a weight entry", scopes: ["write:weight"] },
      { method: "delete", summary: "Delete a weight entry", scopes: ["write:weight"] },
    ],
  },
  {
    path: "/weight/goal",
    methods: [
      { method: "get", summary: "Read the weight goal", scopes: ["read:weight"] },
      { method: "patch", summary: "Update the weight goal", scopes: ["write:weight"] },
    ],
  },
  {
    path: "/stats",
    methods: [{ method: "get", summary: "Read stats", scopes: ["read:stats", "read:weight"] }],
  },
  {
    path: "/summary",
    methods: [
      {
        method: "get",
        summary: "Read dashboard summary data",
        scopes: ["read:stats", "read:daily", "read:goals", "read:weight"],
      },
    ],
  },
  {
    path: "/leaderboard",
    methods: [{ method: "get", summary: "Read personal leaderboard stats", scopes: ["read:stats"] }],
  },
  {
    path: "/openapi.json",
    methods: [{ method: "get", summary: "Read the OpenAPI document", scopes: [] }],
  },
];

function responseSchema() {
  return {
    "application/json": {
      schema: {
        oneOf: [
          {
            type: "object",
            required: ["ok", "data"],
            properties: {
              ok: { const: true },
              data: {},
            },
          },
          {
            type: "object",
            required: ["ok", "error"],
            properties: {
              ok: { const: false },
              error: {
                type: "object",
                required: ["code", "message"],
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        ],
      },
    },
  };
}

function jsonRequestBody(schema: Record<string, unknown>) {
  return {
    required: true,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function pathParameter(name: string) {
  return {
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  };
}

function queryParameter(name: string) {
  return {
    name,
    in: "query",
    required: false,
    schema: { type: "string" },
  };
}

const foodMutationSchema = {
  type: "object",
  required: ["name", "proteinPer100", "carbsPer100", "fatPer100", "caloriesPer100"],
  properties: {
    name: { type: "string" },
    brand: { type: ["string", "null"] },
    barcode: { type: ["string", "null"] },
    defaultServingQuantity: { type: "number", exclusiveMinimum: 0 },
    defaultServingUnit: { type: "string" },
    proteinPer100: { type: "number", minimum: 0 },
    carbsPer100: { type: "number", minimum: 0 },
    fatPer100: { type: "number", minimum: 0 },
    caloriesPer100: { type: "integer", minimum: 0 },
    servingWeightG: { type: ["number", "null"], exclusiveMinimum: 0 },
    servingVolumeMl: { type: ["number", "null"], exclusiveMinimum: 0 },
  },
  additionalProperties: true,
};

const macroFields = {
  proteinG: { type: "number", minimum: 0 },
  carbsG: { type: "number", minimum: 0 },
  fatG: { type: "number", minimum: 0 },
  caloriesKcal: { type: "integer", minimum: 0 },
};

const quantityFields = {
  quantity: { type: "number", exclusiveMinimum: 0 },
  unit: { type: "string" },
  servingMultiplier: { type: "number", exclusiveMinimum: 0 },
};

const goalPatchSchema = {
  type: "object",
  properties: {
    caloriesKcal: { type: ["integer", "null"], minimum: 0 },
    proteinG: { type: ["number", "null"], minimum: 0 },
    carbsG: { type: ["number", "null"], minimum: 0 },
    fatG: { type: ["number", "null"], minimum: 0 },
  },
  additionalProperties: true,
};

const mealEntrySchema = {
  type: "object",
  required: ["label", "proteinG", "carbsG", "fatG", "caloriesKcal"],
  properties: {
    date: { type: "string", format: "date" },
    mealGroupId: { type: ["string", "null"] },
    status: { type: "string", enum: ["planned", "eaten", "skipped"] },
    productId: { type: ["string", "null"] },
    label: { type: "string" },
    sortOrder: { type: "integer", minimum: 0 },
    ...quantityFields,
    ...macroFields,
    clientMutationId: { type: ["string", "null"] },
  },
  additionalProperties: true,
};

const mealGroupSchema = {
  type: "object",
  required: ["label"],
  properties: { label: { type: "string" } },
  additionalProperties: true,
};

const mealEntryStatusSchema = {
  type: "object",
  required: ["status"],
  properties: { status: { type: "string", enum: ["planned", "eaten", "skipped"] } },
  additionalProperties: true,
};

const reorderMealGroupsSchema = {
  type: "object",
  properties: {
    orderedIds: { type: "array", items: { type: "string" } },
    groupIds: { type: "array", items: { type: "string" } },
  },
  additionalProperties: true,
};

const templateItemSchema = {
  type: "object",
  required: ["label", "proteinG", "carbsG", "fatG", "caloriesKcal"],
  properties: {
    productId: { type: ["string", "null"] },
    mealGroupLabel: { type: ["string", "null"] },
    label: { type: "string" },
    ...quantityFields,
    ...macroFields,
  },
  additionalProperties: true,
};

const templateMutationSchema = {
  type: "object",
  required: ["type", "label", "items"],
  properties: {
    type: { type: "string", enum: ["meal", "day"] },
    label: { type: "string" },
    notes: { type: ["string", "null"] },
    items: { type: "array", items: templateItemSchema, minItems: 1 },
  },
  additionalProperties: true,
};

const dateSchema = {
  type: "object",
  required: ["date"],
  properties: { date: { type: "string", format: "date" } },
  additionalProperties: true,
};

const templateFromDaySchema = {
  type: "object",
  required: ["date", "type", "label"],
  properties: {
    date: { type: "string", format: "date" },
    type: { type: "string", enum: ["meal", "day"] },
    label: { type: "string" },
  },
  additionalProperties: true,
};

const recipeIngredientSchema = {
  type: "object",
  required: ["label", "proteinG", "carbsG", "fatG", "caloriesKcal"],
  properties: {
    productId: { type: ["string", "null"] },
    label: { type: "string" },
    ...quantityFields,
    ...macroFields,
  },
  additionalProperties: true,
};

const recipeMutationSchema = {
  type: "object",
  required: ["label", "portions", "ingredients"],
  properties: {
    label: { type: "string" },
    portions: { type: "integer", minimum: 1, maximum: 999 },
    totalCookedWeightG: { type: ["number", "null"], exclusiveMinimum: 0 },
    ingredients: { type: "array", items: recipeIngredientSchema, minItems: 1 },
  },
  additionalProperties: true,
};

const recipeLogSchema = {
  type: "object",
  required: ["date"],
  properties: {
    date: { type: "string", format: "date" },
    portionCount: { type: "number", exclusiveMinimum: 0 },
    gramsConsumed: { type: "number", exclusiveMinimum: 0 },
    status: { type: "string", enum: ["planned", "eaten", "skipped"] },
  },
  additionalProperties: true,
};

const weightEntrySchema = {
  type: "object",
  required: ["date", "weightKg"],
  properties: {
    date: { type: "string", format: "date" },
    weightKg: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1000 },
    bodyFatPct: { type: ["number", "null"], minimum: 0, maximum: 100 },
    notes: { type: ["string", "null"] },
  },
  additionalProperties: true,
};

const weightGoalSchema = {
  type: "object",
  required: ["goalWeightKg"],
  properties: { goalWeightKg: { type: ["number", "null"], exclusiveMinimum: 0, exclusiveMaximum: 1000 } },
  additionalProperties: true,
};

function requestBodyFor(path: string, method: ApiEndpointMethod["method"]) {
  if (path === "/goals" && method === "patch") return jsonRequestBody(goalPatchSchema);
  if (path === "/days/{date}/entries" && method === "post") return jsonRequestBody(mealEntrySchema);
  if (path === "/meal-entries/{id}" && method === "patch") return jsonRequestBody(mealEntrySchema);
  if (path === "/meal-entries/{id}/status" && method === "patch") return jsonRequestBody(mealEntryStatusSchema);
  if (path === "/meal-groups" && method === "post") return jsonRequestBody(mealGroupSchema);
  if (path === "/meal-groups/{id}" && method === "patch") return jsonRequestBody(mealGroupSchema);
  if (path === "/meal-groups/reorder" && method === "post") return jsonRequestBody(reorderMealGroupsSchema);
  if ((path === "/foods" && method === "post") || (path === "/foods/{id}" && method === "patch")) {
    return jsonRequestBody(foodMutationSchema);
  }
  if (path === "/templates" && method === "post") return jsonRequestBody(templateMutationSchema);
  if (path === "/templates/{id}" && method === "patch") return jsonRequestBody(templateMutationSchema);
  if (path === "/templates/{id}/apply" && method === "post") return jsonRequestBody(dateSchema);
  if (path === "/templates/from-day" && method === "post") return jsonRequestBody(templateFromDaySchema);
  if (path === "/recipes" && method === "post") return jsonRequestBody(recipeMutationSchema);
  if (path === "/recipes/{id}" && method === "patch") return jsonRequestBody(recipeMutationSchema);
  if (path === "/recipes/{id}/log" && method === "post") {
    return jsonRequestBody(recipeLogSchema);
  }
  if (path === "/weight/entries" && method === "post") return jsonRequestBody(weightEntrySchema);
  if (path === "/weight/entries/{id}" && method === "patch") return jsonRequestBody(weightEntrySchema);
  if (path === "/weight/goal" && method === "patch") return jsonRequestBody(weightGoalSchema);
  return undefined;
}

function parametersFor(path: string) {
  const parameters = Array.from(path.matchAll(/\{([^}]+)\}/g), (match) =>
    pathParameter(match[1]!),
  );
  if (path === "/foods/search") {
    parameters.push(queryParameter("q"));
  }
  if (["/weight", "/stats", "/summary", "/leaderboard"].includes(path)) {
    parameters.push(queryParameter("date"));
  }
  return parameters.length ? parameters : undefined;
}

export function getApiV1OpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of API_V1_ENDPOINTS) {
    paths[endpoint.path] = Object.fromEntries(
      endpoint.methods.map((method) => {
        const operation: Record<string, unknown> = {
          summary: method.summary,
          security: method.scopes.length
            ? [{ bearerAuth: method.scopes }]
            : [],
          parameters: parametersFor(endpoint.path),
          requestBody: requestBodyFor(endpoint.path, method.method),
          responses: {
            [String(method.successStatus ?? 200)]: {
              description: "Successful response",
              content: responseSchema(),
            },
            "400": {
              description: "Invalid request",
              content: responseSchema(),
            },
            "401": {
              description: "Authentication failed",
              content: responseSchema(),
            },
            "403": {
              description: "Insufficient token scope",
              content: responseSchema(),
            },
            "404": {
              description: "Resource not found",
              content: responseSchema(),
            },
            "405": {
              description: "Method not allowed",
              content: responseSchema(),
            },
            "500": {
              description: "Internal server error",
              content: responseSchema(),
            },
          },
        };

        if (!operation.parameters) delete operation.parameters;
        if (!operation.requestBody) delete operation.requestBody;

        return [method.method, operation];
      }),
    );
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Macro Tracker API",
      version: "1.0.0",
      description: "User-scoped API for normal Macro Tracker objects.",
    },
    servers: [{ url: "/api/v1" }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "mtk_v1 token",
          description: `Personal access token. Available scopes: ${API_SCOPE_VALUES.join(", ")}`,
        },
      },
    },
  };
}
