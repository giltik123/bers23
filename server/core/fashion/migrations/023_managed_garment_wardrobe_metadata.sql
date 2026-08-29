BEGIN;

ALTER TABLE canonical_garments
  ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE canonical_garments
  ADD COLUMN IF NOT EXISTS favorite BOOLEAN;

UPDATE canonical_garments SET category='UNSPECIFIED' WHERE category IS NULL;
UPDATE canonical_garments SET favorite=FALSE WHERE favorite IS NULL;
ALTER TABLE canonical_garments
  ALTER COLUMN category SET DEFAULT 'UNSPECIFIED',
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN favorite SET DEFAULT FALSE,
  ALTER COLUMN favorite SET NOT NULL;
ALTER TABLE canonical_garments
  DROP CONSTRAINT IF EXISTS canonical_garments_category_check;
ALTER TABLE canonical_garments
  ADD CONSTRAINT canonical_garments_category_check
  CHECK (category IN ('UNSPECIFIED','TOP','BOTTOM','DRESS','OUTERWEAR','FOOTWEAR','ACCESSORY','OTHER')) NOT VALID;
ALTER TABLE canonical_garments
  VALIDATE CONSTRAINT canonical_garments_category_check;

CREATE TABLE IF NOT EXISTS canonical_garment_seasons (
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  season TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS canonical_garment_materials (
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  material TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS canonical_garment_tags (
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tag TEXT NOT NULL
);

ALTER TABLE canonical_garment_seasons
  ALTER COLUMN garment_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN season SET NOT NULL;
ALTER TABLE canonical_garment_materials
  ALTER COLUMN garment_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN material SET NOT NULL;
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
    WHERE conrelid=to_regclass('canonical_garment_seasons') AND contype='p'
  LOOP
    EXECUTE format('ALTER TABLE canonical_garment_seasons DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_materials') AND contype='p'
  LOOP
    EXECUTE format('ALTER TABLE canonical_garment_materials DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_tags') AND contype='p'
  LOOP
    EXECUTE format('ALTER TABLE canonical_garment_tags DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE canonical_garment_seasons
  DROP CONSTRAINT IF EXISTS canonical_garment_seasons_value_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_seasons_owner_fkey;
ALTER TABLE canonical_garment_materials
  DROP CONSTRAINT IF EXISTS canonical_garment_materials_value_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_materials_owner_fkey;
ALTER TABLE canonical_garment_tags
  DROP CONSTRAINT IF EXISTS canonical_garment_tags_value_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_tags_owner_fkey;

ALTER TABLE canonical_garment_seasons
  ADD CONSTRAINT canonical_garment_seasons_pkey
    PRIMARY KEY (garment_id, tenant_id, user_id, season),
  ADD CONSTRAINT canonical_garment_seasons_value_check
    CHECK (season IN ('SPRING','SUMMER','AUTUMN','WINTER')) NOT VALID,
  ADD CONSTRAINT canonical_garment_seasons_owner_fkey
    FOREIGN KEY (garment_id, tenant_id, user_id)
    REFERENCES canonical_garments (garment_id, tenant_id, user_id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE canonical_garment_materials
  ADD CONSTRAINT canonical_garment_materials_pkey
    PRIMARY KEY (garment_id, tenant_id, user_id, material),
  ADD CONSTRAINT canonical_garment_materials_value_check
    CHECK (
      char_length(material) BETWEEN 1 AND 50
      AND material = btrim(material)
      AND material = lower(material)
      AND material !~ '[[:cntrl:]]'
    ) NOT VALID,
  ADD CONSTRAINT canonical_garment_materials_owner_fkey
    FOREIGN KEY (garment_id, tenant_id, user_id)
    REFERENCES canonical_garments (garment_id, tenant_id, user_id)
    ON DELETE CASCADE NOT VALID;
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

ALTER TABLE canonical_garment_seasons
  VALIDATE CONSTRAINT canonical_garment_seasons_value_check,
  VALIDATE CONSTRAINT canonical_garment_seasons_owner_fkey;
ALTER TABLE canonical_garment_materials
  VALIDATE CONSTRAINT canonical_garment_materials_value_check,
  VALIDATE CONSTRAINT canonical_garment_materials_owner_fkey;
ALTER TABLE canonical_garment_tags
  VALIDATE CONSTRAINT canonical_garment_tags_value_check,
  VALIDATE CONSTRAINT canonical_garment_tags_owner_fkey;

CREATE INDEX IF NOT EXISTS canonical_garment_seasons_owner_idx
  ON canonical_garment_seasons (tenant_id, user_id, garment_id);
CREATE INDEX IF NOT EXISTS canonical_garment_materials_owner_idx
  ON canonical_garment_materials (tenant_id, user_id, garment_id);
CREATE INDEX IF NOT EXISTS canonical_garment_tags_owner_idx
  ON canonical_garment_tags (tenant_id, user_id, garment_id);

COMMIT;
