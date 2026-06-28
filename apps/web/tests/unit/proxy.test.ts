import type { NextRequest } from "next/server";

import { resetServerEnvForTests } from "@/lib/env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  applySessionCookie: vi.fn(),
  verifySessionToken: vi.fn(),
}));

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    applySessionCookie: mocked.applySessionCookie,
    verifySessionToken: mocked.verifySessionToken,
  };
});

import { proxy } from "@/proxy";

const sessionUser = {
  userId: "user-1",
  email: "coach@example.com",
};

function proxyRequest(
  forwardedHost: string,
  options: {
    path?: string;
    method?: string;
    sessionToken?: string;
    headers?: HeadersInit;
  } = {},
) {
  const url = `http://127.0.0.1:3000${options.path ?? "/dashboard"}`;
  const headers = new Headers({
    "x-forwarded-proto": "https",
    "x-forwarded-host": forwardedHost,
    ...options.headers,
  });

  return {
    nextUrl: new URL(url),
    url,
    method: options.method ?? "GET",
    headers,
    cookies: {
      get: vi.fn(() =>
        options.sessionToken === undefined
          ? undefined
          : { value: options.sessionToken },
      ),
    },
  } as unknown as NextRequest;
}

describe("proxy session refresh", () => {
  beforeEach(() => {
    process.env.APP_URL = "http://app.internal";
    process.env.APP_TRUSTED_ORIGINS = "https://trusted.example";
    resetServerEnvForTests();
    vi.clearAllMocks();
    mocked.verifySessionToken.mockResolvedValue(sessionUser);
  });

  afterEach(() => {
    delete process.env.APP_TRUSTED_ORIGINS;
    resetServerEnvForTests();
  });

  it("refreshes secure cookies for trusted HTTPS request origins", async () => {
    await proxy(proxyRequest("trusted.example", { sessionToken: "session-token" }));

    expect(mocked.verifySessionToken).toHaveBeenCalledWith("session-token");
    expect(mocked.applySessionCookie).toHaveBeenCalledWith(
      expect.anything(),
      sessionUser,
      {
        secure: true,
      },
    );
  });

  it("does not let untrusted forwarded HTTPS headers force secure refreshes", async () => {
    await proxy(proxyRequest("evil.example", { sessionToken: "session-token" }));

    expect(mocked.verifySessionToken).toHaveBeenCalledWith("session-token");
    expect(mocked.applySessionCookie).toHaveBeenCalledWith(
      expect.anything(),
      sessionUser,
      {
        secure: false,
      },
    );
  });

  it("lets unauthenticated API v1 preflight requests reach the route handler", async () => {
    mocked.verifySessionToken.mockResolvedValue(null);

    const response = await proxy(
      proxyRequest("trusted.example", {
        path: "/api/v1/goals",
        method: "OPTIONS",
        headers: {
          origin: "https://client.example",
          "access-control-request-method": "GET",
        },
      }),
    );

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets unauthenticated API v1 bearer requests reach the route handler", async () => {
    mocked.verifySessionToken.mockResolvedValue(null);

    const response = await proxy(
      proxyRequest("trusted.example", {
        path: "/api/v1/goals",
        headers: {
          authorization: "Bearer mtk_v1_token",
        },
      }),
    );

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets unauthenticated OpenAPI JSON requests reach the route handler", async () => {
    mocked.verifySessionToken.mockResolvedValue(null);

    const response = await proxy(
      proxyRequest("trusted.example", { path: "/api/v1/openapi.json" }),
    );

    expect(response.headers.get("location")).toBeNull();
  });

  it("lets unauthenticated API docs requests render the public docs page", async () => {
    mocked.verifySessionToken.mockResolvedValue(null);

    const response = await proxy(
      proxyRequest("trusted.example", { path: "/docs/api" }),
    );

    expect(response.headers.get("location")).toBeNull();
  });
});
