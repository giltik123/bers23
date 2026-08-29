BEGIN;

CREATE TABLE IF NOT EXISTS canonical_garments (
  garment_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  representation_tier TEXT NOT NULL DEFAULT 'BASIC'
    CHECK (representation_tier IN ('BASIC','PARAMETRIC','FULL_3D')),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','ARCHIVED')),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
  primary_view_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  UNIQUE (garment_id, tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS canonical_garment_views (
  view_id UUID PRIMARY KEY,
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  view_kind TEXT NOT NULL
    CHECK (view_kind IN ('UNSPECIFIED','FRONT','BACK','LEFT','RIGHT','DETAIL')),
  source_content_type TEXT NOT NULL
    CHECK (source_content_type IN ('image/png','image/jpeg','image/webp')),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  encoding TEXT NOT NULL DEFAULT 'PNG_RGBA8_LOSSLESS'
    CHECK (encoding = 'PNG_RGBA8_LOSSLESS'),
  content_type TEXT NOT NULL DEFAULT 'image/png'
    CHECK (content_type = 'image/png'),
  content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  storage_backend TEXT NOT NULL DEFAULT 'POSTGRES_BYTEA_V1'
    CHECK (storage_backend = 'POSTGRES_BYTEA_V1'),
  image_bytes BYTEA NOT NULL CHECK (octet_length(image_bytes) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  UNIQUE (view_id, garment_id, tenant_id, user_id),
  UNIQUE (garment_id, ordinal),
  FOREIGN KEY (garment_id, tenant_id, user_id)
    REFERENCES canonical_garments (garment_id, tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE canonical_garments
  DROP CONSTRAINT IF EXISTS canonical_garments_primary_view_owner_fkey;
ALTER TABLE canonical_garments
  ADD CONSTRAINT canonical_garments_primary_view_owner_fkey
  FOREIGN KEY (primary_view_id, garment_id, tenant_id, user_id)
  REFERENCES canonical_garment_views (view_id, garment_id, tenant_id, user_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS canonical_garments_owner_updated_idx
  ON canonical_garments (tenant_id, user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS canonical_garment_views_owner_garment_idx
  ON canonical_garment_views (tenant_id, user_id, garment_id, ordinal)
  WHERE deleted_at IS NULL AND revoked_at IS NULL;

COMMIT;
