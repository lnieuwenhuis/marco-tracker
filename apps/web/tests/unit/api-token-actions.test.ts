import {
  apiTokens,
  listApiTokens,
  setDatabaseRuntimeForTesting,
  upsertUserFromShooProfile,
  type ApiTokenRecord,
  type DatabaseRuntime,
} from "@macro-tracker/db";
import { createTestDatabase } from "@macro-tracker/db/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  userId: "",
  requireSessionUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSessionUser: mocked.requireSessionUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocked.revalidatePath,
}));

import {
  createApiTokenAction,
  revokeApiTokenAction,
} from "@/lib/api-token-actions";
import { getVisibleApiTokens } from "@/components/api-settings-client";

describe("API token settings actions", () => {
  let runtime: DatabaseRuntime;

  beforeEach(async () => {
    runtime = await createTestDatabase();
    setDatabaseRuntimeForTesting(runtime);
    const user = await upsertUserFromShooProfile(
      {
        pairwiseSub: "settings-api-user",
        email: "settings-api@example.com",
      },
      runtime.db,
    );
    mocked.userId = user.id;
    mocked.requireSessionUser.mockResolvedValue({
      userId: user.id,
      email: user.email,
    });
    mocked.revalidatePath.mockClear();
  });

  afterEach(async () => {
    setDatabaseRuntimeForTesting();
    await runtime.close();
    vi.clearAllMocks();
  });

  it("creates a one-time-visible token and revokes it for the session user", async () => {
    const formData = new FormData();
    formData.set("name", "Shortcut");
    formData.set("expires", "never");
    formData.append("scopes", "read:daily");
    formData.append("scopes", "write:daily");

    const created = await createApiTokenAction({}, formData);

    expect(created.ok).toBe(true);
    expect(created.token).toMatch(/^mtk_v1_/);
    expect(created.record).toMatchObject({
      userId: mocked.userId,
      name: "Shortcut",
      scopes: ["read:daily", "write:daily"],
      expiresAt: null,
    });
    expect(mocked.revalidatePath).toHaveBeenCalledWith("/settings/api");

    const listed = await listApiTokens(mocked.userId, runtime.db);
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(created.token);

    const revokeData = new FormData();
    revokeData.set("tokenId", listed[0]!.id);
    await revokeApiTokenAction(revokeData);

    const [revoked] = await listApiTokens(mocked.userId, runtime.db);
    expect(revoked?.revokedAt).toBeTruthy();
  });

  it("returns validation errors for expected API token input failures", async () => {
    const formData = new FormData();
    formData.set("name", "   ");
    formData.set("expires", "never");
    formData.append("scopes", "read:daily");

    await expect(createApiTokenAction({}, formData)).resolves.toEqual({
      ok: false,
      error: "API token name is required.",
    });
  });

  it("hides unexpected API token creation failures from the client", async () => {
    const rawMessage = "database password leaked in driver error";
    const failingDb = new Proxy(runtime.db, {
      get(target, prop, receiver) {
        if (prop === "insert") {
          return (table: unknown) => {
            if (table === apiTokens) {
              throw new Error(rawMessage);
            }

            const insert = Reflect.get(target, prop, receiver) as (insertTable: unknown) => unknown;
            return insert.call(target, table);
          };
        }

        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    setDatabaseRuntimeForTesting({ ...runtime, db: failingDb });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const formData = new FormData();
    formData.set("name", "Shortcut");
    formData.set("expires", "never");
    formData.append("scopes", "read:daily");

    const created = await createApiTokenAction({}, formData);

    expect(created).toEqual({
      ok: false,
      error: "Unable to create API token.",
    });
    expect(JSON.stringify(created)).not.toContain(rawMessage);
    expect(consoleError).toHaveBeenCalledWith("Unexpected API token creation error", expect.any(Error));
    consoleError.mockRestore();
  });

  it("prefers revalidated server token rows over stale newly-created client state", async () => {
    const staleRecord = {
      id: "token-id",
      userId: mocked.userId,
      name: "Shortcut",
      tokenPrefix: "mtk_v1_stale",
      scopes: ["read:daily"],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
    } satisfies ApiTokenRecord;
    const serverRecord = {
      ...staleRecord,
      tokenPrefix: "mtk_v1_fresh",
      revokedAt: "2026-01-02T00:00:00.000Z",
    };

    expect(getVisibleApiTokens([serverRecord], staleRecord)).toEqual([serverRecord]);
  });
});
