import { API_SCOPE_VALUES, type ApiScope } from "@macro-tracker/db";

type ApiEndpointMethod = {
  method: "get" | "post" | "patch" | "delete";
  summary: string;
  scopes: ApiScope[];
};

type ApiEndpoint = {
  path: string;
  methods: ApiEndpointMethod[];
};

export const API_V1_ENDPOINTS: ApiEndpoint[] = [
  {
    path: "/me",
    methods: [{ method: "get", summary: "Read the authenticated account", scopes: ["read:account"] }],
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
    methods: [{ method: "post", summary: "Create a meal entry on a date", scopes: ["write:daily"] }],
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
      { method: "post", summary: "Create a meal group", scopes: ["write:daily"] },
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
    methods: [{ method: "post", summary: "Create a personal food product", scopes: ["write:foods"] }],
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
      { method: "post", summary: "Create a meal template", scopes: ["write:templates"] },
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
    methods: [{ method: "post", summary: "Apply a template to a date", scopes: ["read:templates", "write:daily"] }],
  },
  {
    path: "/templates/from-day",
    methods: [{ method: "post", summary: "Create a template from a day", scopes: ["read:daily", "write:templates"] }],
  },
  {
    path: "/recipes",
    methods: [
      { method: "get", summary: "List recipes", scopes: ["read:recipes"] },
      { method: "post", summary: "Create a recipe", scopes: ["write:recipes"] },
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
    methods: [{ method: "post", summary: "Log a recipe portion", scopes: ["read:recipes", "write:daily"] }],
  },
  {
    path: "/weight",
    methods: [{ method: "get", summary: "Read weight entries and progress", scopes: ["read:weight"] }],
  },
  {
    path: "/weight/entries",
    methods: [
      { method: "get", summary: "List weight entries", scopes: ["read:weight"] },
      { method: "post", summary: "Create a weight entry", scopes: ["write:weight"] },
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

export function getApiV1OpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of API_V1_ENDPOINTS) {
    paths[endpoint.path] = Object.fromEntries(
      endpoint.methods.map((method) => [
        method.method,
        {
          summary: method.summary,
          security: method.scopes.length
            ? [{ bearerAuth: method.scopes }]
            : [],
          responses: {
            "200": {
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
          },
        },
      ]),
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
