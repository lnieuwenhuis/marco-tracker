WITH active_global_barcode_duplicates AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "barcode"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "duplicate_rank"
  FROM "food_products"
  WHERE
    "owner_user_id" IS NULL
    AND "source" = 'barcode'
    AND "deleted_at" IS NULL
    AND "barcode" IS NOT NULL
)
UPDATE "food_products"
SET
  "deleted_at" = now(),
  "updated_at" = now(),
  "source_metadata" = COALESCE("source_metadata", '{}'::jsonb) || jsonb_build_object(
    'deduplicatedByMigration',
    '0011_active_global_barcode_unique'
  )
FROM active_global_barcode_duplicates
WHERE
  "food_products"."id" = active_global_barcode_duplicates."id"
  AND active_global_barcode_duplicates."duplicate_rank" > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "food_products_active_global_barcode_key" ON "food_products" USING btree ("barcode")
WHERE
  "owner_user_id" IS NULL
  AND "source" = 'barcode'
  AND "deleted_at" IS NULL
  AND "barcode" IS NOT NULL;
