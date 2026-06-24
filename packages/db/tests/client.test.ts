import { describe, expect, it } from "vitest";

import { getPostgresConnectionConfig, getSslConfig } from "../src";

describe("database client SSL config", () => {
  it("verifies remote database certificates by default", () => {
    expect(getSslConfig("postgres://user:pass@db.example.com:5432/macro")).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("rejects insecure remote sslmode values", () => {
    expect(
      () =>
        getSslConfig(
          "postgres://user:pass@db.example.com:5432/macro?sslmode=no-verify",
        ),
    ).toThrow("sslmode=no-verify");
    expect(
      () =>
        getSslConfig(
          "postgres://user:pass@db.example.com:5432/macro?sslmode=disable",
        ),
    ).toThrow("sslmode=disable");
  });

  it("preserves localhost non-TLS behavior", () => {
    expect(getSslConfig("postgres://user:pass@localhost:5432/macro")).toBe(false);
    expect(getSslConfig("postgres://user:pass@127.0.0.1:5432/macro")).toBe(false);
  });

  it("strips sslmode=require before constructing remote pool config", () => {
    expect(
      getPostgresConnectionConfig(
        "postgres://user:pass@db.example.com:5432/macro?sslmode=require",
      ),
    ).toEqual({
      connectionString: "postgres://user:pass@db.example.com:5432/macro",
      ssl: { rejectUnauthorized: false },
    });
  });

  it("keeps chain verification for sslmode=verify-full", () => {
    expect(
      getPostgresConnectionConfig(
        "postgres://user:pass@db.example.com:5432/macro?sslmode=verify-full",
      ),
    ).toEqual({
      connectionString: "postgres://user:pass@db.example.com:5432/macro",
      ssl: { rejectUnauthorized: true },
    });
  });
});
