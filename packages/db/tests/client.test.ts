import { describe, expect, it } from "vitest";

import { getSslConfig } from "../src";

describe("database client SSL config", () => {
  it("verifies remote database certificates by default", () => {
    expect(getSslConfig("postgres://user:pass@db.example.com:5432/macro")).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("preserves explicit sslmode=disable", () => {
    expect(
      getSslConfig("postgres://user:pass@db.example.com:5432/macro?sslmode=disable"),
    ).toBe(false);
  });

  it("preserves localhost non-TLS behavior", () => {
    expect(getSslConfig("postgres://user:pass@localhost:5432/macro")).toBe(false);
    expect(getSslConfig("postgres://user:pass@127.0.0.1:5432/macro")).toBe(false);
  });
});
