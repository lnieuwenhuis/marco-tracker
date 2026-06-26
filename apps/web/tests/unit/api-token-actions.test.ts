import {
  listApiTokens,
  setDatabaseRuntimeForTesting,
  upsertUserFromShooProfile,
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
});
