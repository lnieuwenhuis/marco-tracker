import { resetServerEnvForTests } from "@/lib/env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  applySessionCookie: vi.fn(),
  completeUserOnboarding: vi.fn(),
  ensureUserRole: vi.fn(),
  getDb: vi.fn(),
  upsertUserFromShooProfile: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    applySessionCookie: mocked.applySessionCookie,
  };
});

vi.mock("@macro-tracker/db", () => ({
  completeUserOnboarding: mocked.completeUserOnboarding,
  ensureUserRole: mocked.ensureUserRole,
  getDb: mocked.getDb,
  upsertUserFromShooProfile: mocked.upsertUserFromShooProfile,
}));

import { POST } from "@/app/api/test/session/route";

function testSessionRequest(forwardedHost: string) {
  return new Request("http://127.0.0.1:3000/api/test/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
      "x-forwarded-host": forwardedHost,
    },
    body: JSON.stringify({ email: "coach@example.com" }),
  });
}

describe("POST /api/test/session", () => {
  beforeEach(() => {
    process.env.APP_URL = "http://app.internal";
    process.env.APP_TRUSTED_ORIGINS = "https://trusted.example";
    process.env.ENABLE_TEST_ROUTES = "true";
    resetServerEnvForTests();
    vi.clearAllMocks();
    mocked.execute.mockResolvedValue(undefined);
    mocked.getDb.mockResolvedValue({
      execute: mocked.execute,
    });
    mocked.completeUserOnboarding.mockResolvedValue(undefined);
    mocked.ensureUserRole.mockResolvedValue(undefined);
    mocked.upsertUserFromShooProfile.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
    });
  });

  afterEach(() => {
    delete process.env.APP_TRUSTED_ORIGINS;
    delete process.env.ENABLE_TEST_ROUTES;
    resetServerEnvForTests();
  });

  it("creates secure cookies for trusted HTTPS request origins", async () => {
    const response = await POST(testSessionRequest("trusted.example"));

    expect(response.status).toBe(200);
    expect(mocked.applySessionCookie).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: "user-1",
        email: "coach@example.com",
      },
      {
        secure: true,
      },
    );
  });

  it("does not let untrusted forwarded HTTPS headers force secure test sessions", async () => {
    const response = await POST(testSessionRequest("evil.example"));

    expect(response.status).toBe(200);
    expect(mocked.applySessionCookie).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: "user-1",
        email: "coach@example.com",
      },
      {
        secure: false,
      },
    );
  });
});
