import {
  createAdminBarcodeProduct,
  createTemplate,
  ensureUserRole,
  getAdminUserDetail,
  getAdminBarcodeProductById,
  listAdminAuditEvents,
  listAdminBarcodeProducts,
  listAdminUsers,
  lookupBarcodeFoodProduct,
  searchFoodProducts,
  setUserRole,
  softDeleteAdminBarcodeProduct,
  restoreAdminBarcodeProduct,
  updateAdminBarcodeProduct,
  upsertUserFromShooProfile,
  type DatabaseRuntime,
} from "../src";
import { createTestDatabase } from "../src/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("admin queries", () => {
  let runtime: DatabaseRuntime;
  let ownerId: string;
  let adminId: string;
  let userId: string;

  beforeEach(async () => {
    runtime = await createTestDatabase();

    const owner = await upsertUserFromShooProfile(
      {
        pairwiseSub: "ps_owner",
        email: "owner@example.com",
        displayName: "Owner",
      },
      runtime.db,
    );
    const admin = await upsertUserFromShooProfile(
      {
        pairwiseSub: "ps_admin",
        email: "admin@example.com",
        displayName: "Admin",
      },
      runtime.db,
    );
    const user = await upsertUserFromShooProfile(
      {
        pairwiseSub: "ps_user",
        email: "user@example.com",
        displayName: "User",
      },
      runtime.db,
    );

    ownerId = owner.id;
    adminId = admin.id;
    userId = user.id;

    await ensureUserRole(ownerId, "owner", runtime.db);
    await ensureUserRole(adminId, "admin", runtime.db);
  });

  afterEach(async () => {
    await runtime.close();
  });

  it("changes roles, prevents demoting the last owner, and records an audit event", async () => {
    const promoted = await setUserRole(ownerId, userId, "admin", runtime.db);
    expect(promoted.role).toBe("admin");

    await expect(
      setUserRole(ownerId, ownerId, "user", runtime.db),
    ).rejects.toThrow("last owner");

    const audit = await listAdminAuditEvents(
      {
        targetType: "user",
        targetId: userId,
        pageSize: 10,
      },
      runtime.db,
    );

    expect(audit.items[0]?.action).toBe("user.role_changed");
    expect(audit.items[0]?.details).toMatchObject({
      fromRole: "user",
      toRole: "admin",
      targetEmail: "user@example.com",
    });
  });

  it("filters admin user listings by role", async () => {
    const adminUsers = await listAdminUsers(
      {
        role: "admin",
        pageSize: 25,
      },
      runtime.db,
    );

    expect(adminUsers.items.map((item) => item.email)).toEqual([
      "admin@example.com",
    ]);
  });

  it("creates, updates, soft-deletes, restores, and filters barcode records", async () => {
    const created = await createAdminBarcodeProduct(
      adminId,
      {
        barcode: "9900000000001",
        name: "Admin Peanut Butter",
        brands: "Macro Lab",
        proteinG: 25,
        carbsG: 18,
        fatG: 50,
        caloriesKcal: 620,
        servingSizeG: 15,
      },
      runtime.db,
    );

    expect(await lookupBarcodeFoodProduct("9900000000001", runtime.db)).toMatchObject({
      name: "Admin Peanut Butter",
      submittedByUserId: adminId,
    });
    expect(
      await searchFoodProducts(userId, "Admin Peanut Butter", runtime.db),
    ).toMatchObject([
      {
        barcode: "9900000000001",
        name: "Admin Peanut Butter",
        source: "barcode",
      },
    ]);

    const updated = await updateAdminBarcodeProduct(
      adminId,
      created.id,
      {
        barcode: "9900000000002",
        name: "Admin Peanut Butter Deluxe",
        brands: "Macro Lab",
        proteinG: 26,
        carbsG: 17,
        fatG: 49,
        caloriesKcal: 615,
        servingSizeG: 15,
      },
      runtime.db,
    );

    expect(updated.name).toBe("Admin Peanut Butter Deluxe");
    expect(await lookupBarcodeFoodProduct("9900000000001", runtime.db)).toBeNull();
    expect(await lookupBarcodeFoodProduct("9900000000002", runtime.db)).toMatchObject({
      name: "Admin Peanut Butter Deluxe",
    });
    expect(await searchFoodProducts(userId, "Deluxe", runtime.db)).toMatchObject([
      {
        barcode: "9900000000002",
        name: "Admin Peanut Butter Deluxe",
        proteinPer100: 26,
        carbsPer100: 17,
        fatPer100: 49,
        caloriesPer100: 615,
      },
    ]);
    expect(
      (await searchFoodProducts(userId, "Admin Peanut Butter", runtime.db)).map(
        (product) => product.barcode,
      ),
    ).toEqual(["9900000000002"]);

    const deleted = await softDeleteAdminBarcodeProduct(
      adminId,
      created.id,
      runtime.db,
    );
    expect(deleted.deletedAt).toBeTruthy();
    expect(await lookupBarcodeFoodProduct("9900000000001", runtime.db)).toBeNull();
    expect(await lookupBarcodeFoodProduct("9900000000002", runtime.db)).toBeNull();
    expect(await searchFoodProducts(userId, "Deluxe", runtime.db)).toEqual([]);

    const deletedOnly = await listAdminBarcodeProducts(
      {
        status: "deleted",
        pageSize: 25,
      },
      runtime.db,
    );
    expect(deletedOnly.items.map((item) => item.id)).toContain(created.id);

    const restored = await restoreAdminBarcodeProduct(
      adminId,
      created.id,
      runtime.db,
    );
    expect(restored.deletedAt).toBeNull();
    expect(await lookupBarcodeFoodProduct("9900000000002", runtime.db)).toMatchObject({
      name: "Admin Peanut Butter Deluxe",
    });
    expect(await searchFoodProducts(userId, "Deluxe", runtime.db)).toMatchObject([
      {
        barcode: "9900000000002",
        name: "Admin Peanut Butter Deluxe",
      },
    ]);

    const detail = await getAdminBarcodeProductById(created.id, runtime.db);
    expect(detail?.deletedAt).toBeNull();

    const audit = await listAdminAuditEvents(
      {
        targetType: "food_product",
        targetId: created.id,
        pageSize: 10,
      },
      runtime.db,
    );
    expect(audit.items.map((item) => item.action)).toEqual([
      "barcode.restored",
      "barcode.deleted",
      "barcode.updated",
      "barcode.created",
    ]);
  });

  it("prevents restoring a deleted barcode when an active replacement uses the same barcode", async () => {
    const deletedOriginal = await createAdminBarcodeProduct(
      adminId,
      {
        barcode: "9900000000099",
        name: "Original Barcode Food",
        brands: "Macro Lab",
        proteinG: 12,
        carbsG: 20,
        fatG: 4,
        caloriesKcal: 164,
        servingSizeG: 100,
      },
      runtime.db,
    );
    await softDeleteAdminBarcodeProduct(adminId, deletedOriginal.id, runtime.db);
    await createAdminBarcodeProduct(
      adminId,
      {
        barcode: "9900000000099",
        name: "Replacement Barcode Food",
        brands: "Macro Lab",
        proteinG: 14,
        carbsG: 18,
        fatG: 5,
        caloriesKcal: 173,
        servingSizeG: 100,
      },
      runtime.db,
    );

    await expect(
      restoreAdminBarcodeProduct(adminId, deletedOriginal.id, runtime.db),
    ).rejects.toThrow("That barcode already exists.");

    const stillDeleted = await getAdminBarcodeProductById(
      deletedOriginal.id,
      runtime.db,
    );
    expect(stillDeleted?.deletedAt).toBeTruthy();
    expect(await lookupBarcodeFoodProduct("9900000000099", runtime.db)).toMatchObject({
      name: "Replacement Barcode Food",
    });
  });

  it("prevents duplicate active barcode creates and updates", async () => {
    await createAdminBarcodeProduct(
      adminId,
      {
        barcode: "9900000000101",
        name: "Original Duplicate Guard Food",
        brands: "Macro Lab",
        proteinG: 10,
        carbsG: 20,
        fatG: 5,
        caloriesKcal: 165,
        servingSizeG: 100,
      },
      runtime.db,
    );

    await expect(
      createAdminBarcodeProduct(
        adminId,
        {
          barcode: "9900000000101",
          name: "Duplicate Guard Food",
          brands: "Macro Lab",
          proteinG: 12,
          carbsG: 19,
          fatG: 6,
          caloriesKcal: 178,
          servingSizeG: 100,
        },
        runtime.db,
      ),
    ).rejects.toThrow("That barcode already exists.");

    const other = await createAdminBarcodeProduct(
      adminId,
      {
        barcode: "9900000000102",
        name: "Other Duplicate Guard Food",
        brands: "Macro Lab",
        proteinG: 14,
        carbsG: 18,
        fatG: 4,
        caloriesKcal: 164,
        servingSizeG: 100,
      },
      runtime.db,
    );

    await expect(
      updateAdminBarcodeProduct(
        adminId,
        other.id,
        {
          barcode: "9900000000101",
          name: "Other Duplicate Guard Food",
          brands: "Macro Lab",
          proteinG: 14,
          carbsG: 18,
          fatG: 4,
          caloriesKcal: 164,
          servingSizeG: 100,
        },
        runtime.db,
      ),
    ).rejects.toThrow("That barcode already exists.");

    expect(await getAdminBarcodeProductById(other.id, runtime.db)).toMatchObject({
      barcode: "9900000000102",
    });
  });

  it("enforces active global barcode uniqueness at the database level", async () => {
    await createAdminBarcodeProduct(
      adminId,
      {
        barcode: "9900000000201",
        name: "Indexed Barcode Food",
        brands: "Macro Lab",
        proteinG: 10,
        carbsG: 20,
        fatG: 5,
        caloriesKcal: 165,
        servingSizeG: 100,
      },
      runtime.db,
    );

    await expect(
      runtime.db.execute(sql.raw(`
        INSERT INTO "food_products" (
          "id",
          "owner_user_id",
          "scope",
          "source",
          "barcode",
          "name",
          "brand",
          "default_serving_quantity",
          "default_serving_unit",
          "protein_per_100",
          "carbs_per_100",
          "fat_per_100",
          "calories_per_100",
          "serving_weight_g"
        )
        VALUES (
          '11111111-2222-4333-8444-555555555555',
          NULL,
          'global',
          'barcode',
          '9900000000201',
          'Duplicate Indexed Barcode Food',
          'Macro Lab',
          '1.00',
          'serving',
          10.00,
          20.00,
          5.00,
          165,
          '100.00'
        )
      `)),
    ).rejects.toThrow();

    await expect(
      runtime.db.execute(sql.raw(`
        INSERT INTO "food_products" (
          "id",
          "owner_user_id",
          "scope",
          "source",
          "barcode",
          "name",
          "brand",
          "default_serving_quantity",
          "default_serving_unit",
          "protein_per_100",
          "carbs_per_100",
          "fat_per_100",
          "calories_per_100",
          "serving_weight_g",
          "deleted_at"
        )
        VALUES (
          '11111111-2222-4333-8444-555555555556',
          NULL,
          'global',
          'barcode',
          '9900000000201',
          'Deleted Indexed Barcode Food',
          'Macro Lab',
          '1.00',
          'serving',
          10.00,
          20.00,
          5.00,
          165,
          '100.00',
          now()
        )
      `)),
    ).resolves.toBeTruthy();
  });

  it("finds active barcode duplicates when a newer deleted duplicate also exists", async () => {
    const active = await createAdminBarcodeProduct(
      adminId,
      {
        barcode: "9900000000301",
        name: "Active Masking Guard Food",
        brands: "Macro Lab",
        proteinG: 10,
        carbsG: 20,
        fatG: 5,
        caloriesKcal: 165,
        servingSizeG: 100,
      },
      runtime.db,
    );

    await runtime.db.execute(sql.raw(`
      INSERT INTO "food_products" (
        "id",
        "owner_user_id",
        "scope",
        "source",
        "barcode",
        "name",
        "brand",
        "default_serving_quantity",
        "default_serving_unit",
        "protein_per_100",
        "carbs_per_100",
        "fat_per_100",
        "calories_per_100",
        "serving_weight_g",
        "updated_at",
        "deleted_at"
      )
      VALUES (
        '11111111-2222-4333-8444-555555555557',
        NULL,
        'global',
        'barcode',
        '9900000000301',
        'Deleted Masking Guard Food',
        'Macro Lab',
        '1.00',
        'serving',
        10.00,
        20.00,
        5.00,
        165,
        '100.00',
        '2999-01-01 00:00:00+00',
        '2999-01-01 00:00:00+00'
      )
    `));

    const other = await createAdminBarcodeProduct(
      adminId,
      {
        barcode: "9900000000302",
        name: "Other Masking Guard Food",
        brands: "Macro Lab",
        proteinG: 14,
        carbsG: 18,
        fatG: 4,
        caloriesKcal: 164,
        servingSizeG: 100,
      },
      runtime.db,
    );

    await expect(
      updateAdminBarcodeProduct(
        adminId,
        other.id,
        {
          barcode: "9900000000301",
          name: "Other Masking Guard Food",
          brands: "Macro Lab",
          proteinG: 14,
          carbsG: 18,
          fatG: 4,
          caloriesKcal: 164,
          servingSizeG: 100,
        },
        runtime.db,
      ),
    ).rejects.toThrow("That barcode already exists.");

    expect(await lookupBarcodeFoodProduct("9900000000301", runtime.db)).toMatchObject({
      id: active.id,
      name: "Active Masking Guard Food",
    });
    expect(await getAdminBarcodeProductById(other.id, runtime.db)).toMatchObject({
      barcode: "9900000000302",
    });
  });

  it("loads item macros for recent templates in admin user detail", async () => {
    await createTemplate(
      userId,
      {
        type: "day",
        label: "Two item day",
        items: [
          {
            label: "Breakfast",
            proteinG: 20,
            carbsG: 40,
            fatG: 8,
            caloriesKcal: 312,
          },
          {
            label: "Lunch",
            proteinG: 30,
            carbsG: 50,
            fatG: 12,
            caloriesKcal: 428,
          },
        ],
      },
      runtime.db,
    );

    const detail = await getAdminUserDetail(userId, runtime.db);
    const template = detail?.recentTemplates.find(
      (item) => item.label === "Two item day",
    );

    expect(template?.items).toHaveLength(2);
    expect(
      template?.items.reduce(
        (sum, item) => sum + item.caloriesKcal,
        0,
      ),
    ).toBe(740);
  });
});
