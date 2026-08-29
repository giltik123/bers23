BEGIN;

ALTER TABLE canonical_garments
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'UNSPECIFIED';
ALTER TABLE canonical_garments
  ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garments')
      AND conname='canonical_garments_category_check'
  ) THEN
    ALTER TABLE canonical_garments
      ADD CONSTRAINT canonical_garments_category_check
      CHECK (category IN ('UNSPECIFIED','TOP','BOTTOM','DRESS','OUTERWEAR','FOOTWEAR','ACCESSORY','OTHER'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS canonical_garment_seasons (
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  season TEXT NOT NULL,
  PRIMARY KEY (garment_id, tenant_id, user_id, season),
  CONSTRAINT canonical_garment_seasons_value_check
    CHECK (season IN ('SPRING','SUMMER','AUTUMN','WINTER')),
  CONSTRAINT canonical_garment_seasons_owner_fkey
    FOREIGN KEY (garment_id, tenant_id, user_id)
    REFERENCES canonical_garments (garment_id, tenant_id, user_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS canonical_garment_materials (
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  material TEXT NOT NULL,
  PRIMARY KEY (garment_id, tenant_id, user_id, material),
  CONSTRAINT canonical_garment_materials_value_check
    CHECK (
      char_length(material) BETWEEN 1 AND 50
      AND material = btrim(material)
      AND material = lower(material)
      AND material !~ '[[:cntrl:]]'
    ),
  CONSTRAINT canonical_garment_materials_owner_fkey
    FOREIGN KEY (garment_id, tenant_id, user_id)
    REFERENCES canonical_garments (garment_id, tenant_id, user_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS canonical_garment_tags (
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (garment_id, tenant_id, user_id, tag),
  CONSTRAINT canonical_garment_tags_value_check
    CHECK (
      char_length(tag) BETWEEN 1 AND 40
      AND tag = btrim(tag)
      AND tag = lower(tag)
      AND tag !~ '[[:cntrl:]]'
    ),
  CONSTRAINT canonical_garment_tags_owner_fkey
    FOREIGN KEY (garment_id, tenant_id, user_id)
    REFERENCES canonical_garments (garment_id, tenant_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS canonical_garment_seasons_owner_idx
  ON canonical_garment_seasons (tenant_id, user_id, garment_id);
CREATE INDEX IF NOT EXISTS canonical_garment_materials_owner_idx
  ON canonical_garment_materials (tenant_id, user_id, garment_id);
CREATE INDEX IF NOT EXISTS canonical_garment_tags_owner_idx
  ON canonical_garment_tags (tenant_id, user_id, garment_id);

COMMIT;
