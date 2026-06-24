import { describe, expect, it } from "vitest";

type StartupMigrationModule = {
  getPostgresConnectionConfig: (connectionString: string) => {
    connectionString: string;
    ssl: false | { rejectUnauthorized: boolean };
  };
};

async function getStartupMigrationModule() {
  const moduleUrl = new URL(
    "../../scripts/start-with-migrations.mjs",
    import.meta.url,
  ).href;

  return (await import(moduleUrl)) as StartupMigrationModule;
}

describe("startup migration database SSL config", () => {
  it("rejects insecure remote sslmode=no-verify", async () => {
    const { getPostgresConnectionConfig } = await getStartupMigrationModule();

    expect(() =>
      getPostgresConnectionConfig(
        "postgres://user:pass@db.example.com:5432/macro?sslmode=no-verify",
      ),
    ).toThrow("sslmode=no-verify");
  });

  it("strips secure remote sslmode before constructing the pool", async () => {
    const { getPostgresConnectionConfig } = await getStartupMigrationModule();

    expect(
      getPostgresConnectionConfig(
        "postgres://user:pass@db.example.com:5432/macro?sslmode=require",
      ),
    ).toEqual({
      connectionString: "postgres://user:pass@db.example.com:5432/macro",
      ssl: { rejectUnauthorized: true },
    });
  });
});
