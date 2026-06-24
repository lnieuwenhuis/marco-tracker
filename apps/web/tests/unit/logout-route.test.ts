import { resetServerEnvForTests } from "@/lib/env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  clearSessionCookie: vi.fn(),
}));

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    clearSessionCookie: mocked.clearSessionCookie,
  };
});

import { GET } from "@/app/api/auth/logout/route";

function logoutRequest(forwardedHost: string) {
  return new Request("http://127.0.0.1:3000/api/auth/logout", {
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": forwardedHost,
    },
  });
}

describe("GET /api/auth/logout", () => {
  beforeEach(() => {
    process.env.APP_URL = "http://app.internal";
    process.env.APP_TRUSTED_ORIGINS = "https://trusted.example";
    resetServerEnvForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.APP_TRUSTED_ORIGINS;
    resetServerEnvForTests();
  });

  it("clears secure cookies for trusted HTTPS request origins", async () => {
    await GET(logoutRequest("trusted.example"));

    expect(mocked.clearSessionCookie).toHaveBeenCalledWith(expect.anything(), {
      secure: true,
    });
  });

  it("does not let untrusted forwarded HTTPS headers force secure clearing", async () => {
    await GET(logoutRequest("evil.example"));

    expect(mocked.clearSessionCookie).toHaveBeenCalledWith(expect.anything(), {
      secure: false,
    });
  });
});
