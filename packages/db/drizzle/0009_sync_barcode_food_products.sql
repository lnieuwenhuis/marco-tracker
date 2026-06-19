UPDATE "food_products"
SET
  "name" = "barcode_products"."name",
  "brand" = "barcode_products"."brands",
  "default_serving_quantity" = '1.00',
  "default_serving_unit" = 'serving',
  "protein_per_100" = "barcode_products"."protein_g",
  "carbs_per_100" = "barcode_products"."carbs_g",
  "fat_per_100" = "barcode_products"."fat_g",
  "calories_per_100" = "barcode_products"."calories_kcal",
  "serving_weight_g" = COALESCE("barcode_products"."serving_size_g", '100.00'),
  "serving_volume_ml" = NULL,
  "updated_at" = "barcode_products"."updated_at",
  "deleted_at" = "barcode_products"."deleted_at"
FROM "barcode_products"
WHERE
  "food_products"."owner_user_id" IS NULL
  AND "food_products"."source" = 'barcode'
  AND "food_products"."barcode" = "barcode_products"."barcode";
--> statement-breakpoint
WITH source_barcode_products AS (
  SELECT
    (
      substr(md5('global-barcode-food:' || "barcode_products"."barcode"), 1, 8) || '-' ||
      substr(md5('global-barcode-food:' || "barcode_products"."barcode"), 9, 4) || '-' ||
      substr(md5('global-barcode-food:' || "barcode_products"."barcode"), 13, 4) || '-' ||
      substr(md5('global-barcode-food:' || "barcode_products"."barcode"), 17, 4) || '-' ||
      substr(md5('global-barcode-food:' || "barcode_products"."barcode"), 21, 12)
    )::uuid AS "id",
    "barcode_products"."barcode",
    "barcode_products"."name",
    "barcode_products"."brands",
    "barcode_products"."protein_g",
    "barcode_products"."carbs_g",
    "barcode_products"."fat_g",
    "barcode_products"."calories_kcal",
    "barcode_products"."serving_size_g",
    "barcode_products"."created_at",
    "barcode_products"."updated_at",
    "barcode_products"."deleted_at"
  FROM "barcode_products"
)
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
  "serving_volume_ml",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  "id",
  NULL,
  'global',
  'barcode',
  "barcode",
  "name",
  "brands",
  '1.00',
  'serving',
  "protein_g",
  "carbs_g",
  "fat_g",
  "calories_kcal",
  COALESCE("serving_size_g", '100.00'),
  NULL,
  "created_at",
  "updated_at",
  "deleted_at"
FROM source_barcode_products
WHERE NOT EXISTS (
  SELECT 1
  FROM "food_products"
  WHERE
    "food_products"."owner_user_id" IS NULL
    AND "food_products"."source" = 'barcode'
    AND "food_products"."barcode" = source_barcode_products."barcode"
);
--> statement-breakpoint
UPDATE "food_products"
SET
  "deleted_at" = COALESCE("food_products"."deleted_at", now()),
  "updated_at" = now()
WHERE
  "food_products"."owner_user_id" IS NULL
  AND "food_products"."source" = 'barcode'
  AND NOT EXISTS (
    SELECT 1
    FROM "barcode_products"
    WHERE "barcode_products"."barcode" = "food_products"."barcode"
  );
