ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_weight_unit" text DEFAULT 'kg' NOT NULL;
--> statement-breakpoint
UPDATE "users"
SET "onboarding_completed_at" = COALESCE("onboarding_completed_at", "created_at", now())
WHERE "onboarding_completed_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "food_products" ADD COLUMN "submitted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "food_products" ADD COLUMN "deleted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "food_products" ADD COLUMN "source_provider" text;
--> statement-breakpoint
ALTER TABLE "food_products" ADD COLUMN "source_confidence" numeric(4, 2);
--> statement-breakpoint
ALTER TABLE "food_products" ADD COLUMN "source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "food_products" ADD COLUMN "corrected_from_product_id" uuid REFERENCES "food_products"("id") ON DELETE SET NULL;
--> statement-breakpoint
UPDATE "food_products"
SET
  "submitted_by_user_id" = "barcode_products"."added_by_user_id",
  "deleted_by_user_id" = "barcode_products"."deleted_by_user_id",
  "source_provider" = 'community',
  "source_metadata" = jsonb_build_object(
    'legacyBarcodeProductId', "barcode_products"."id",
    'servingSizeG', "barcode_products"."serving_size_g"
  ),
  "updated_at" = GREATEST("food_products"."updated_at", "barcode_products"."updated_at")
FROM "barcode_products"
WHERE
  "food_products"."owner_user_id" IS NULL
  AND "food_products"."source" = 'barcode'
  AND "food_products"."barcode" = "barcode_products"."barcode";
--> statement-breakpoint
UPDATE "admin_audit_events"
SET
  "target_type" = 'food_product',
  "target_id" = "food_products"."id"::text,
  "details_json" = COALESCE("admin_audit_events"."details_json", '{}'::jsonb) || jsonb_build_object(
    'legacyBarcodeProductId', "admin_audit_events"."target_id"
  )
FROM "food_products"
WHERE
  "admin_audit_events"."target_type" = 'barcode_product'
  AND "food_products"."owner_user_id" IS NULL
  AND "food_products"."source" = 'barcode'
  AND "food_products"."source_metadata"->>'legacyBarcodeProductId' = "admin_audit_events"."target_id";
--> statement-breakpoint
CREATE INDEX "food_products_submitted_by_idx" ON "food_products" USING btree ("submitted_by_user_id");
--> statement-breakpoint
CREATE INDEX "food_products_corrected_from_idx" ON "food_products" USING btree ("corrected_from_product_id");
--> statement-breakpoint
CREATE TABLE "food_product_revisions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "food_products"("id") ON DELETE cascade,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "food_product_revisions_product_idx" ON "food_product_revisions" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX "food_product_revisions_actor_idx" ON "food_product_revisions" USING btree ("actor_user_id");
--> statement-breakpoint
CREATE INDEX "food_product_revisions_created_at_idx" ON "food_product_revisions" USING btree ("created_at");
--> statement-breakpoint
INSERT INTO "food_product_revisions" (
  "id",
  "product_id",
  "actor_user_id",
  "action",
  "snapshot_json",
  "created_at"
)
SELECT
  (
    substr(md5('food-product-revision:imported:' || "food_products"."id"::text), 1, 8) || '-' ||
    substr(md5('food-product-revision:imported:' || "food_products"."id"::text), 9, 4) || '-' ||
    substr(md5('food-product-revision:imported:' || "food_products"."id"::text), 13, 4) || '-' ||
    substr(md5('food-product-revision:imported:' || "food_products"."id"::text), 17, 4) || '-' ||
    substr(md5('food-product-revision:imported:' || "food_products"."id"::text), 21, 12)
  )::uuid,
  "food_products"."id",
  "food_products"."submitted_by_user_id",
  'imported',
  jsonb_build_object(
    'id', "food_products"."id",
    'scope', "food_products"."scope",
    'source', "food_products"."source",
    'barcode', "food_products"."barcode",
    'name', "food_products"."name",
    'brand', "food_products"."brand",
    'proteinPer100', "food_products"."protein_per_100",
    'carbsPer100', "food_products"."carbs_per_100",
    'fatPer100', "food_products"."fat_per_100",
    'caloriesPer100', "food_products"."calories_per_100",
    'servingWeightG', "food_products"."serving_weight_g",
    'servingVolumeMl', "food_products"."serving_volume_ml"
  ),
  "food_products"."created_at"
FROM "food_products";
--> statement-breakpoint
CREATE TABLE "meal_templates" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" text DEFAULT 'meal' NOT NULL,
  "label" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meal_template_items" (
  "id" uuid PRIMARY KEY NOT NULL,
  "template_id" uuid NOT NULL REFERENCES "meal_templates"("id") ON DELETE cascade,
  "product_id" uuid REFERENCES "food_products"("id") ON DELETE SET NULL,
  "meal_group_label" text,
  "sort_order" integer NOT NULL,
  "label" text NOT NULL,
  "quantity" numeric(8, 2) DEFAULT '1' NOT NULL,
  "unit" text DEFAULT 'serving' NOT NULL,
  "serving_multiplier" numeric(8, 2) DEFAULT '1' NOT NULL,
  "protein_g" numeric(6, 1) NOT NULL,
  "carbs_g" numeric(6, 1) NOT NULL,
  "fat_g" numeric(6, 1) NOT NULL,
  "calories_kcal" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meal_templates_user_type_idx" ON "meal_templates" USING btree ("user_id","type");
--> statement-breakpoint
CREATE INDEX "meal_templates_deleted_at_idx" ON "meal_templates" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "meal_template_items_template_idx" ON "meal_template_items" USING btree ("template_id");
--> statement-breakpoint
CREATE INDEX "meal_template_items_product_idx" ON "meal_template_items" USING btree ("product_id");
--> statement-breakpoint
INSERT INTO "meal_templates" (
  "id",
  "user_id",
  "type",
  "label",
  "created_at",
  "updated_at"
)
SELECT
  "food_presets"."id",
  "food_presets"."user_id",
  'meal',
  "food_presets"."label",
  "food_presets"."created_at",
  COALESCE("food_presets"."last_used_at", "food_presets"."created_at")
FROM "food_presets";
--> statement-breakpoint
INSERT INTO "meal_template_items" (
  "id",
  "template_id",
  "product_id",
  "meal_group_label",
  "sort_order",
  "label",
  "quantity",
  "unit",
  "serving_multiplier",
  "protein_g",
  "carbs_g",
  "fat_g",
  "calories_kcal",
  "created_at"
)
SELECT
  (
    substr(md5('meal-template-item:preset:' || "food_presets"."id"::text), 1, 8) || '-' ||
    substr(md5('meal-template-item:preset:' || "food_presets"."id"::text), 9, 4) || '-' ||
    substr(md5('meal-template-item:preset:' || "food_presets"."id"::text), 13, 4) || '-' ||
    substr(md5('meal-template-item:preset:' || "food_presets"."id"::text), 17, 4) || '-' ||
    substr(md5('meal-template-item:preset:' || "food_presets"."id"::text), 21, 12)
  )::uuid,
  "food_presets"."id",
  NULL,
  NULL,
  0,
  "food_presets"."label",
  '1.00',
  'serving',
  '1.00',
  "food_presets"."protein_g",
  "food_presets"."carbs_g",
  "food_presets"."fat_g",
  "food_presets"."calories_kcal",
  "food_presets"."created_at"
FROM "food_presets";
--> statement-breakpoint
DROP TABLE "food_presets";
--> statement-breakpoint
DROP TABLE "barcode_products";
