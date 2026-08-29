BEGIN;

CREATE TABLE IF NOT EXISTS canonical_garment_collections (
  collection_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS canonical_garment_collection_members (
  collection_id UUID NOT NULL,
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE canonical_garment_collections
  ADD COLUMN IF NOT EXISTS collection_id UUID,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE canonical_garment_collection_members
  ADD COLUMN IF NOT EXISTS collection_id UUID,
  ADD COLUMN IF NOT EXISTS garment_id UUID,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

UPDATE canonical_garment_collections SET description='' WHERE description IS NULL;
UPDATE canonical_garment_collections SET revision=1 WHERE revision IS NULL;
UPDATE canonical_garment_collections SET created_at=CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE canonical_garment_collections SET updated_at=CURRENT_TIMESTAMP WHERE updated_at IS NULL;
UPDATE canonical_garment_collection_members SET created_at=CURRENT_TIMESTAMP WHERE created_at IS NULL;

ALTER TABLE canonical_garment_collections
  ALTER COLUMN collection_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN description SET DEFAULT '',
  ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN revision SET DEFAULT 1,
  ALTER COLUMN revision SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE canonical_garment_collection_members
  ALTER COLUMN collection_id SET NOT NULL,
  ALTER COLUMN garment_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN created_at SET NOT NULL;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collections')
      AND conname='canonical_garment_collections_pkey' AND contype='p'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (collection_id)'
  ) THEN
    FOR constraint_name IN
      SELECT conname FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collections') AND contype='p'
    LOOP
      EXECUTE format('ALTER TABLE canonical_garment_collections DROP CONSTRAINT %I', constraint_name);
    END LOOP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collection_members')
      AND conname='canonical_garment_collection_members_pkey' AND contype='p'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (collection_id, garment_id)'
  ) THEN
    FOR constraint_name IN
      SELECT conname FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collection_members') AND contype='p'
    LOOP
      EXECUTE format('ALTER TABLE canonical_garment_collection_members DROP CONSTRAINT %I', constraint_name);
    END LOOP;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collections')
      AND conname='canonical_garment_collections_owner_unique'
      AND NOT (contype='u' AND pg_get_constraintdef(oid)='UNIQUE (collection_id, tenant_id, user_id)')
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collections DROP CONSTRAINT canonical_garment_collections_owner_unique';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collections')
      AND conname='canonical_garment_collections_name_check'
      AND NOT (
        contype='c'
        AND pg_get_constraintdef(oid) LIKE '%char_length(name)%'
        AND pg_get_constraintdef(oid) LIKE '%>= 1%'
        AND pg_get_constraintdef(oid) LIKE '%<= 100%'
        AND pg_get_constraintdef(oid) LIKE '%btrim(name)%'
        AND pg_get_constraintdef(oid) LIKE '%cntrl%'
        AND pg_get_constraintdef(oid) NOT LIKE '% OR %'
      )
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collections DROP CONSTRAINT canonical_garment_collections_name_check';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collections')
      AND conname='canonical_garment_collections_description_check'
      AND NOT (
        contype='c'
        AND pg_get_constraintdef(oid) LIKE '%char_length(description)%'
        AND pg_get_constraintdef(oid) LIKE '%<= 500%'
        AND pg_get_constraintdef(oid) LIKE '%cntrl%'
        AND pg_get_constraintdef(oid) NOT LIKE '% OR %'
      )
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collections DROP CONSTRAINT canonical_garment_collections_description_check';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collections')
      AND conname='canonical_garment_collections_revision_check'
      AND NOT (contype='c' AND pg_get_constraintdef(oid) LIKE '%revision >= 1%' AND pg_get_constraintdef(oid) NOT LIKE '% OR %')
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collections DROP CONSTRAINT canonical_garment_collections_revision_check';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collection_members')
      AND conname='canonical_garment_collection_members_collection_owner_fkey'
      AND NOT (
        contype='f' AND confdeltype='c' AND confrelid=to_regclass('canonical_garment_collections')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (collection_id, tenant_id, user_id) REFERENCES canonical_garment_collections(collection_id, tenant_id, user_id)%ON DELETE CASCADE%'
      )
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collection_members DROP CONSTRAINT canonical_garment_collection_members_collection_owner_fkey';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collection_members')
      AND conname='canonical_garment_collection_members_garment_owner_fkey'
      AND NOT (
        contype='f' AND confdeltype='c' AND confrelid=to_regclass('canonical_garments')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%ON DELETE CASCADE%'
      )
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collection_members DROP CONSTRAINT canonical_garment_collection_members_garment_owner_fkey';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collections')
      AND conname='canonical_garment_collections_pkey' AND contype='p'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (collection_id)'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collections ADD CONSTRAINT canonical_garment_collections_pkey PRIMARY KEY (collection_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collections')
      AND conname='canonical_garment_collections_owner_unique' AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (collection_id, tenant_id, user_id)'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collections ADD CONSTRAINT canonical_garment_collections_owner_unique UNIQUE (collection_id, tenant_id, user_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collection_members')
      AND conname='canonical_garment_collection_members_pkey' AND contype='p'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (collection_id, garment_id)'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collection_members ADD CONSTRAINT canonical_garment_collection_members_pkey PRIMARY KEY (collection_id, garment_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collections') AND conname='canonical_garment_collections_name_check'
  ) THEN
    EXECUTE $ddl$ALTER TABLE canonical_garment_collections ADD CONSTRAINT canonical_garment_collections_name_check CHECK (
      char_length(name) BETWEEN 1 AND 100 AND name = btrim(name) AND name !~ '[[:cntrl:]]'
    ) NOT VALID$ddl$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collections') AND conname='canonical_garment_collections_description_check'
  ) THEN
    EXECUTE $ddl$ALTER TABLE canonical_garment_collections ADD CONSTRAINT canonical_garment_collections_description_check CHECK (
      char_length(description) <= 500 AND description !~ '[[:cntrl:]]'
    ) NOT VALID$ddl$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collections') AND conname='canonical_garment_collections_revision_check'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collections ADD CONSTRAINT canonical_garment_collections_revision_check CHECK (revision >= 1) NOT VALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collection_members') AND conname='canonical_garment_collection_members_collection_owner_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collection_members ADD CONSTRAINT canonical_garment_collection_members_collection_owner_fkey FOREIGN KEY (collection_id, tenant_id, user_id) REFERENCES canonical_garment_collections (collection_id, tenant_id, user_id) ON DELETE CASCADE NOT VALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_collection_members') AND conname='canonical_garment_collection_members_garment_owner_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_garment_collection_members ADD CONSTRAINT canonical_garment_collection_members_garment_owner_fkey FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments (garment_id, tenant_id, user_id) ON DELETE CASCADE NOT VALID';
  END IF;
END $$;

ALTER TABLE canonical_garment_collections
  VALIDATE CONSTRAINT canonical_garment_collections_name_check,
  VALIDATE CONSTRAINT canonical_garment_collections_description_check,
  VALIDATE CONSTRAINT canonical_garment_collections_revision_check;
ALTER TABLE canonical_garment_collection_members
  VALIDATE CONSTRAINT canonical_garment_collection_members_collection_owner_fkey,
  VALIDATE CONSTRAINT canonical_garment_collection_members_garment_owner_fkey;

CREATE INDEX IF NOT EXISTS canonical_garment_collections_owner_updated_idx
  ON canonical_garment_collections (tenant_id, user_id, updated_at DESC, collection_id);
CREATE INDEX IF NOT EXISTS canonical_garment_collection_members_owner_idx
  ON canonical_garment_collection_members (tenant_id, user_id, collection_id, created_at, garment_id);
CREATE INDEX IF NOT EXISTS canonical_garment_collection_members_garment_idx
  ON canonical_garment_collection_members (tenant_id, user_id, garment_id, collection_id);

COMMIT;
