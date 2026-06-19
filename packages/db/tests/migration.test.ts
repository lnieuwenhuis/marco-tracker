import { eq, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { createDatabaseRuntime, type DatabaseRuntime } from "../src";
import { foodProducts, recipeIngredients } from "../src/schema";

const migrationFiles = [
  "0000_yielding_the_spike.sql",
  "0001_lucky_maelstrom.sql",
  "0002_parched_romulus.sql",
  "0003_clean_doctor_octopus.sql",
  "0004_amazing_betty_brant.sql",
  "0005_community_barcode_products.sql",
  "0006_preset_last_used_at.sql",
  "0007_admin_panel.sql",
  "0008_product_model_meal_planning.sql",
  "0009_sync_barcode_food_products.sql",
] as const;

async function applyMigration(runtime: DatabaseRuntime, fileName: string) {
  const migrationUrl = new URL(`../drizzle/${fileName}`, import.meta.url);
  const migrationSql = await readFile(fileURLToPath(migrationUrl), "utf8");
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await runtime.db.execute(sql.raw(statement));
  }
}

describe("database migrations", () => {
  let runtime: DatabaseRuntime | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
  });

  it("collapses duplicate normalized legacy product labels during meal-planning migration", async () => {
    runtime = await createDatabaseRuntime("memory:");

    for (const fileName of migrationFiles.slice(0, 8)) {
      await applyMigration(runtime, fileName);
    }

    const userId = "11111111-1111-4111-8111-111111111111";
    const recipeId = "22222222-2222-4222-8222-222222222222";

    await runtime.db.execute(sql.raw(`
      INSERT INTO "users" ("id", "shoo_pairwise_sub", "email", "display_name")
      VALUES ('${userId}', 'duplicate_legacy_user', 'duplicate@example.com', 'Duplicate User')
    `));
    await runtime.db.execute(sql.raw(`
      INSERT INTO "meal_entries" (
        "id",
        "user_id",
        "entry_date",
        "label",
        "sort_order",
        "protein_g",
        "carbs_g",
        "fat_g",
        "calories_kcal"
      )
      VALUES
        ('33333333-3333-4333-8333-333333333333', '${userId}', '2026-06-01', 'Oats', 0, 5.0, 27.0, 3.0, 150),
        ('44444444-4444-4444-8444-444444444444', '${userId}', '2026-06-02', ' oats ', 0, 5.0, 27.0, 3.0, 150)
    `));
    await runtime.db.execute(sql.raw(`
      INSERT INTO "recipes" ("id", "user_id", "label", "portions")
      VALUES ('${recipeId}', '${userId}', 'Duplicate Ingredient Recipe', 1)
    `));
    await runtime.db.execute(sql.raw(`
      INSERT INTO "recipe_ingredients" (
        "id",
        "recipe_id",
        "sort_order",
        "label",
        "protein_g",
        "carbs_g",
        "fat_g",
        "calories_kcal"
      )
      VALUES
        ('55555555-5555-4555-8555-555555555555', '${recipeId}', 0, 'Rice', 4.0, 40.0, 1.0, 185),
        ('66666666-6666-4666-8666-666666666666', '${recipeId}', 1, ' rice ', 4.0, 40.0, 1.0, 185)
    `));

    await applyMigration(runtime, "0008_product_model_meal_planning.sql");

    const products = await runtime.db
      .select()
      .from(foodProducts)
      .where(eq(foodProducts.ownerUserId, userId));
    expect(products).toHaveLength(2);
    expect(products.map((product) => product.name.toLowerCase()).sort()).toEqual([
      "oats",
      "rice",
    ]);

    const migratedIngredients = await runtime.db.select().from(recipeIngredients);
    const ingredientProductIds = new Set(
      migratedIngredients.map((ingredient) => ingredient.productId),
    );
    expect(ingredientProductIds.size).toBe(1);
    expect([...ingredientProductIds][0]).toBeTruthy();
  });

  it("syncs existing barcode products into global food products", async () => {
    runtime = await createDatabaseRuntime("memory:");

    for (const fileName of migrationFiles.slice(0, 9)) {
      await applyMigration(runtime, fileName);
    }

    await runtime.db.execute(sql.raw(`
      INSERT INTO "barcode_products" (
        "id",
        "barcode",
        "name",
        "brands",
        "protein_g",
        "carbs_g",
        "fat_g",
        "calories_kcal",
        "serving_size_g"
      )
      VALUES (
        '77777777-7777-4777-8777-777777777777',
        '8712345000001',
        'Community Protein Drink',
        'Macro Lab',
        20.0,
        8.0,
        2.0,
        130,
        250.0
      )
    `));

    await applyMigration(runtime, "0009_sync_barcode_food_products.sql");

    const products = await runtime.db
      .select()
      .from(foodProducts)
      .where(eq(foodProducts.barcode, "8712345000001"));

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      ownerUserId: null,
      scope: "global",
      source: "barcode",
      barcode: "8712345000001",
      name: "Community Protein Drink",
      brand: "Macro Lab",
      caloriesPer100: 130,
    });
  });
});
