BEGIN;

ALTER TABLE canonical_garments
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS season TEXT,
  ADD COLUMN IF NOT EXISTS material TEXT,
  ADD COLUMN IF NOT EXISTS favorite BOOLEAN;

UPDATE canonical_garments SET category='other' WHERE category IS NULL;
UPDATE canonical_garments SET season='all_season' WHERE season IS NULL;
UPDATE canonical_garments SET material='' WHERE material IS NULL;
UPDATE canonical_garments SET favorite=FALSE WHERE favorite IS NULL;

ALTER TABLE canonical_garments
  ALTER COLUMN category SET DEFAULT 'other',
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN season SET DEFAULT 'all_season',
  ALTER COLUMN season SET NOT NULL,
  ALTER COLUMN material SET DEFAULT '',
  ALTER COLUMN material SET NOT NULL,
  ALTER COLUMN favorite SET DEFAULT FALSE,
  ALTER COLUMN favorite SET NOT NULL;

ALTER TABLE canonical_garments
  DROP CONSTRAINT IF EXISTS canonical_garments_category_check,
  DROP CONSTRAINT IF EXISTS canonical_garments_season_check,
  DROP CONSTRAINT IF EXISTS canonical_garments_material_check;

ALTER TABLE canonical_garments
  ADD CONSTRAINT canonical_garments_category_check
    CHECK (category IN (
      'tshirts','shirts','jackets','hoodies','sweaters',
      'pants','shorts','jeans','skirts','dresses',
      'shoes','boots','sneakers','sandals',
      'hats','glasses','scarves','bags','belts','jewelry','gloves','socks','other'
    )) NOT VALID,
  ADD CONSTRAINT canonical_garments_season_check
    CHECK (season IN ('all_season','spring','summer','autumn','winter')) NOT VALID,
  ADD CONSTRAINT canonical_garments_material_check
    CHECK (
      char_length(material) <= 50
      AND material = btrim(material)
      AND material = lower(material)
      AND material !~ '[[:cntrl:]]'
    ) NOT VALID;

ALTER TABLE canonical_garments
  VALIDATE CONSTRAINT canonical_garments_category_check,
  VALIDATE CONSTRAINT canonical_garments_season_check,
  VALIDATE CONSTRAINT canonical_garments_material_check;

CREATE TABLE IF NOT EXISTS canonical_garment_tags (
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tag TEXT NOT NULL
);

ALTER TABLE canonical_garment_tags
  ALTER COLUMN garment_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN tag SET NOT NULL;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_tags') AND contype='p'
  LOOP
    EXECUTE format('ALTER TABLE canonical_garment_tags DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE canonical_garment_tags
  DROP CONSTRAINT IF EXISTS canonical_garment_tags_value_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_tags_owner_fkey;

ALTER TABLE canonical_garment_tags
  ADD CONSTRAINT canonical_garment_tags_pkey
    PRIMARY KEY (garment_id, tenant_id, user_id, tag),
  ADD CONSTRAINT canonical_garment_tags_value_check
    CHECK (
      char_length(tag) BETWEEN 1 AND 40
      AND tag = btrim(tag)
      AND tag = lower(tag)
      AND tag !~ '[[:cntrl:]]'
    ) NOT VALID,
  ADD CONSTRAINT canonical_garment_tags_owner_fkey
    FOREIGN KEY (garment_id, tenant_id, user_id)
    REFERENCES canonical_garments (garment_id, tenant_id, user_id)
    ON DELETE CASCADE NOT VALID;

ALTER TABLE canonical_garment_tags
  VALIDATE CONSTRAINT canonical_garment_tags_value_check,
  VALIDATE CONSTRAINT canonical_garment_tags_owner_fkey;

CREATE INDEX IF NOT EXISTS canonical_garment_tags_owner_idx
  ON canonical_garment_tags (tenant_id, user_id, garment_id);

COMMIT;
