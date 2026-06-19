CREATE TABLE "food_products" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
  "scope" text DEFAULT 'personal' NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "barcode" text,
  "name" text NOT NULL,
  "brand" text DEFAULT '' NOT NULL,
  "default_serving_quantity" numeric(8, 2) DEFAULT '1' NOT NULL,
  "default_serving_unit" text DEFAULT 'serving' NOT NULL,
  "protein_per_100" numeric(7, 2) NOT NULL,
  "carbs_per_100" numeric(7, 2) NOT NULL,
  "fat_per_100" numeric(7, 2) NOT NULL,
  "calories_per_100" integer NOT NULL,
  "serving_weight_g" numeric(8, 2),
  "serving_volume_ml" numeric(8, 2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meal_groups" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "label" text NOT NULL,
  "sort_order" integer NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "meal_entries" ADD COLUMN "meal_group_id" uuid REFERENCES "meal_groups"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "meal_entries" ADD COLUMN "status" text DEFAULT 'eaten' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meal_entries" ADD COLUMN "product_id" uuid REFERENCES "food_products"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "meal_entries" ADD COLUMN "quantity" numeric(8, 2) DEFAULT '1' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meal_entries" ADD COLUMN "unit" text DEFAULT 'serving' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meal_entries" ADD COLUMN "serving_multiplier" numeric(8, 2) DEFAULT '1' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meal_entries" ADD COLUMN "client_mutation_id" text;
--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "total_cooked_weight_g" numeric(8, 2);
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "product_id" uuid REFERENCES "food_products"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "quantity" numeric(8, 2) DEFAULT '1' NOT NULL;
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "unit" text DEFAULT 'serving' NOT NULL;
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "serving_multiplier" numeric(8, 2) DEFAULT '1' NOT NULL;
--> statement-breakpoint
CREATE INDEX "food_products_owner_name_idx" ON "food_products" USING btree ("owner_user_id","name");
--> statement-breakpoint
CREATE INDEX "food_products_barcode_idx" ON "food_products" USING btree ("barcode");
--> statement-breakpoint
CREATE INDEX "food_products_scope_source_idx" ON "food_products" USING btree ("scope","source");
--> statement-breakpoint
CREATE INDEX "food_products_deleted_at_idx" ON "food_products" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "meal_groups_user_sort_idx" ON "meal_groups" USING btree ("user_id","sort_order");
--> statement-breakpoint
CREATE INDEX "meal_groups_deleted_at_idx" ON "meal_groups" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "meal_entries_user_date_status_idx" ON "meal_entries" USING btree ("user_id","entry_date","status");
--> statement-breakpoint
CREATE INDEX "meal_entries_meal_group_idx" ON "meal_entries" USING btree ("meal_group_id");
--> statement-breakpoint
CREATE INDEX "meal_entries_product_idx" ON "meal_entries" USING btree ("product_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "meal_entries_user_client_mutation_key" ON "meal_entries" USING btree ("user_id","client_mutation_id");
--> statement-breakpoint
CREATE INDEX "recipe_ingredients_product_idx" ON "recipe_ingredients" USING btree ("product_id");
--> statement-breakpoint
INSERT INTO "meal_groups" ("id", "user_id", "label", "sort_order", "is_default")
SELECT
  (
    substr(md5("users"."id"::text || ':meal-group:' || defaults.label), 1, 8) || '-' ||
    substr(md5("users"."id"::text || ':meal-group:' || defaults.label), 9, 4) || '-' ||
    substr(md5("users"."id"::text || ':meal-group:' || defaults.label), 13, 4) || '-' ||
    substr(md5("users"."id"::text || ':meal-group:' || defaults.label), 17, 4) || '-' ||
    substr(md5("users"."id"::text || ':meal-group:' || defaults.label), 21, 12)
  )::uuid,
  "users"."id",
  defaults.label,
  defaults.sort_order,
  true
FROM "users"
CROSS JOIN (
  VALUES ('Breakfast', 0), ('Lunch', 1), ('Dinner', 2), ('Snack', 3)
) AS defaults(label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "meal_groups" WHERE "meal_groups"."user_id" = "users"."id"
);
--> statement-breakpoint
WITH legacy_foods AS (
  SELECT DISTINCT
    "meal_entries"."user_id" AS owner_user_id,
    "meal_entries"."label" AS name,
    "meal_entries"."protein_g" AS protein_per_100,
    "meal_entries"."carbs_g" AS carbs_per_100,
    "meal_entries"."fat_g" AS fat_per_100,
    "meal_entries"."calories_kcal" AS calories_per_100,
    md5(
      "meal_entries"."user_id"::text || ':legacy-food:' ||
      lower(trim("meal_entries"."label")) || ':' ||
      "meal_entries"."protein_g"::text || ':' ||
      "meal_entries"."carbs_g"::text || ':' ||
      "meal_entries"."fat_g"::text || ':' ||
      "meal_entries"."calories_kcal"::text
    ) AS hash
  FROM "meal_entries"
)
INSERT INTO "food_products" (
  "id",
  "owner_user_id",
  "scope",
  "source",
  "name",
  "protein_per_100",
  "carbs_per_100",
  "fat_per_100",
  "calories_per_100",
  "serving_weight_g"
)
SELECT
  (
    substr(hash, 1, 8) || '-' ||
    substr(hash, 9, 4) || '-' ||
    substr(hash, 13, 4) || '-' ||
    substr(hash, 17, 4) || '-' ||
    substr(hash, 21, 12)
  )::uuid,
  owner_user_id,
  'legacy',
  'legacy',
  name,
  protein_per_100,
  carbs_per_100,
  fat_per_100,
  calories_per_100,
  '100'
FROM legacy_foods;
--> statement-breakpoint
WITH legacy_ingredients AS (
  SELECT DISTINCT
    "recipes"."user_id" AS owner_user_id,
    "recipe_ingredients"."label" AS name,
    "recipe_ingredients"."protein_g" AS protein_per_100,
    "recipe_ingredients"."carbs_g" AS carbs_per_100,
    "recipe_ingredients"."fat_g" AS fat_per_100,
    "recipe_ingredients"."calories_kcal" AS calories_per_100,
    md5(
      "recipes"."user_id"::text || ':legacy-food:' ||
      lower(trim("recipe_ingredients"."label")) || ':' ||
      "recipe_ingredients"."protein_g"::text || ':' ||
      "recipe_ingredients"."carbs_g"::text || ':' ||
      "recipe_ingredients"."fat_g"::text || ':' ||
      "recipe_ingredients"."calories_kcal"::text
    ) AS hash
  FROM "recipe_ingredients"
  INNER JOIN "recipes" ON "recipes"."id" = "recipe_ingredients"."recipe_id"
)
INSERT INTO "food_products" (
  "id",
  "owner_user_id",
  "scope",
  "source",
  "name",
  "protein_per_100",
  "carbs_per_100",
  "fat_per_100",
  "calories_per_100",
  "serving_weight_g"
)
SELECT
  (
    substr(hash, 1, 8) || '-' ||
    substr(hash, 9, 4) || '-' ||
    substr(hash, 13, 4) || '-' ||
    substr(hash, 17, 4) || '-' ||
    substr(hash, 21, 12)
  )::uuid,
  owner_user_id,
  'legacy',
  'legacy',
  name,
  protein_per_100,
  carbs_per_100,
  fat_per_100,
  calories_per_100,
  '100'
FROM legacy_ingredients
WHERE NOT EXISTS (
  SELECT 1 FROM "food_products"
  WHERE "food_products"."id" = (
    substr(legacy_ingredients.hash, 1, 8) || '-' ||
    substr(legacy_ingredients.hash, 9, 4) || '-' ||
    substr(legacy_ingredients.hash, 13, 4) || '-' ||
    substr(legacy_ingredients.hash, 17, 4) || '-' ||
    substr(legacy_ingredients.hash, 21, 12)
  )::uuid
);
--> statement-breakpoint
UPDATE "recipe_ingredients"
SET "product_id" = (
  substr(md5("recipes"."user_id"::text || ':legacy-food:' || lower(trim("recipe_ingredients"."label")) || ':' || "recipe_ingredients"."protein_g"::text || ':' || "recipe_ingredients"."carbs_g"::text || ':' || "recipe_ingredients"."fat_g"::text || ':' || "recipe_ingredients"."calories_kcal"::text), 1, 8) || '-' ||
  substr(md5("recipes"."user_id"::text || ':legacy-food:' || lower(trim("recipe_ingredients"."label")) || ':' || "recipe_ingredients"."protein_g"::text || ':' || "recipe_ingredients"."carbs_g"::text || ':' || "recipe_ingredients"."fat_g"::text || ':' || "recipe_ingredients"."calories_kcal"::text), 9, 4) || '-' ||
  substr(md5("recipes"."user_id"::text || ':legacy-food:' || lower(trim("recipe_ingredients"."label")) || ':' || "recipe_ingredients"."protein_g"::text || ':' || "recipe_ingredients"."carbs_g"::text || ':' || "recipe_ingredients"."fat_g"::text || ':' || "recipe_ingredients"."calories_kcal"::text), 13, 4) || '-' ||
  substr(md5("recipes"."user_id"::text || ':legacy-food:' || lower(trim("recipe_ingredients"."label")) || ':' || "recipe_ingredients"."protein_g"::text || ':' || "recipe_ingredients"."carbs_g"::text || ':' || "recipe_ingredients"."fat_g"::text || ':' || "recipe_ingredients"."calories_kcal"::text), 17, 4) || '-' ||
  substr(md5("recipes"."user_id"::text || ':legacy-food:' || lower(trim("recipe_ingredients"."label")) || ':' || "recipe_ingredients"."protein_g"::text || ':' || "recipe_ingredients"."carbs_g"::text || ':' || "recipe_ingredients"."fat_g"::text || ':' || "recipe_ingredients"."calories_kcal"::text), 21, 12)
)::uuid
FROM "recipes"
WHERE "recipes"."id" = "recipe_ingredients"."recipe_id";
