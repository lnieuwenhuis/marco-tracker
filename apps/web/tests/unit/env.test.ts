import { getServerEnv, resetServerEnvForTests } from "@/lib/env";
import { afterEach, describe, expect, it } from "vitest";

const originalEnv = {
  APP_TRUSTED_ORIGINS: process.env.APP_TRUSTED_ORIGINS,
  APP_URL: process.env.APP_URL,
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    setEnv(key, value);
  }
}

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("getServerEnv", () => {
  afterEach(() => {
    restoreEnv();
    resetServerEnvForTests();
  });

  it("requires APP_URL in production", () => {
    setEnv("NODE_ENV", "production");
    delete process.env.APP_URL;
    delete process.env.APP_TRUSTED_ORIGINS;
    process.env.SESSION_SECRET = "production-secret";
    resetServerEnvForTests();

    expect(() => getServerEnv()).toThrow("APP_URL is required.");
  });

  it("keeps the localhost APP_URL fallback outside production", () => {
    setEnv("NODE_ENV", "development");
    delete process.env.APP_URL;
    delete process.env.APP_TRUSTED_ORIGINS;
    delete process.env.SESSION_SECRET;
    resetServerEnvForTests();

    expect(getServerEnv()).toMatchObject({
      appUrl: "http://localhost:3000",
      trustedOrigins: ["http://localhost:3000"],
    });
  });
});
