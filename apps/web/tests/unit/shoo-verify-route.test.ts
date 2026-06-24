import { resetServerEnvForTests } from "@/lib/env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  class MockShooAuthError extends Error {
    status: number;
    code: string;

    constructor(message: string, status: number, code: string) {
      super(message);
      this.name = "ShooAuthError";
      this.status = status;
      this.code = code;
    }
  }

  return {
    applySessionCookie: vi.fn(),
    authorizeShooLogin: vi.fn(),
    ShooAuthError: MockShooAuthError,
  };
});

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    applySessionCookie: mocked.applySessionCookie,
  };
});

vi.mock("@/lib/shoo", () => ({
  authorizeShooLogin: mocked.authorizeShooLogin,
  ShooAuthError: mocked.ShooAuthError,
}));

import { POST } from "@/app/api/auth/shoo/verify/route";

function shooVerifyRequest(idToken: string, forwardedHost: string) {
  return new Request("http://127.0.0.1:3000/api/auth/shoo/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
      "x-forwarded-host": forwardedHost,
    },
    body: JSON.stringify({ idToken }),
  });
}

describe("POST /api/auth/shoo/verify", () => {
  beforeEach(() => {
    process.env.APP_URL = "http://app.example";
    process.env.APP_TRUSTED_ORIGINS = "https://trusted.example";
    process.env.SESSION_SECRET = "test-secret";
    process.env.SHOO_BASE_URL = "https://shoo.dev";
    resetServerEnvForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.APP_TRUSTED_ORIGINS;
    resetServerEnvForTests();
  });

  it("accepts a token for a configured trusted forwarded origin", async () => {
    mocked.authorizeShooLogin.mockImplementation(async (idToken, _db, options) => {
      if (
        idToken !== "token-for-trusted-origin" ||
        options?.appOrigin !== "https://trusted.example"
      ) {
        throw new mocked.ShooAuthError(
          "Shoo token has an invalid audience.",
          401,
          "invalid_token",
        );
      }

      return {
        sessionUser: {
          userId: "user-1",
          email: "coach@example.com",
        },
      };
    });

    const response = await POST(
      shooVerifyRequest("token-for-trusted-origin", "trusted.example"),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      user: {
        userId: "user-1",
        email: "coach@example.com",
      },
    });
    expect(response.status).toBe(200);
    expect(mocked.authorizeShooLogin).toHaveBeenCalledWith(
      "token-for-trusted-origin",
      undefined,
      {
        appOrigin: "https://trusted.example",
      },
    );
    expect(mocked.applySessionCookie).toHaveBeenCalledTimes(1);
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

  it("rejects a token for an untrusted forwarded origin", async () => {
    mocked.authorizeShooLogin.mockImplementation(async (idToken, _db, options) => {
      if (
        idToken === "token-for-untrusted-origin" &&
        options?.appOrigin === "https://evil.example"
      ) {
        return {
          sessionUser: {
            userId: "user-1",
            email: "coach@example.com",
          },
        };
      }

      throw new mocked.ShooAuthError(
        "Shoo token has an invalid audience.",
        401,
        "invalid_token",
      );
    });

    const response = await POST(
      shooVerifyRequest("token-for-untrusted-origin", "evil.example"),
    );

    await expect(response.json()).resolves.toEqual({
      error: "Shoo token has an invalid audience.",
      code: "invalid_token",
    });
    expect(response.status).toBe(401);
    expect(mocked.authorizeShooLogin).toHaveBeenCalledWith(
      "token-for-untrusted-origin",
      undefined,
      {
        appOrigin: "http://app.example",
      },
    );
    expect(mocked.applySessionCookie).not.toHaveBeenCalled();
  });

  it("does not use untrusted forwarded HTTPS headers for secure cookies", async () => {
    mocked.authorizeShooLogin.mockImplementation(async (idToken, _db, options) => {
      if (
        idToken !== "token-for-app-origin" ||
        options?.appOrigin !== "http://app.example"
      ) {
        throw new mocked.ShooAuthError(
          "Shoo token has an invalid audience.",
          401,
          "invalid_token",
        );
      }

      return {
        sessionUser: {
          userId: "user-1",
          email: "coach@example.com",
        },
      };
    });

    const response = await POST(
      shooVerifyRequest("token-for-app-origin", "evil.example"),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      user: {
        userId: "user-1",
        email: "coach@example.com",
      },
    });
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
