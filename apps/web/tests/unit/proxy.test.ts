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

function proxyRequest(forwardedHost: string) {
  const url = "http://127.0.0.1:3000/dashboard";

  return {
    nextUrl: new URL(url),
    url,
    headers: new Headers({
      "x-forwarded-proto": "https",
      "x-forwarded-host": forwardedHost,
    }),
    cookies: {
      get: vi.fn(() => ({ value: "session-token" })),
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
    await proxy(proxyRequest("trusted.example"));

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
    await proxy(proxyRequest("evil.example"));

    expect(mocked.verifySessionToken).toHaveBeenCalledWith("session-token");
    expect(mocked.applySessionCookie).toHaveBeenCalledWith(
      expect.anything(),
      sessionUser,
      {
        secure: false,
      },
    );
  });
});
