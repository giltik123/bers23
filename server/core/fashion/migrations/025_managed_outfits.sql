BEGIN;

CREATE TABLE IF NOT EXISTS canonical_outfits (
  outfit_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'casual',
  season TEXT NOT NULL DEFAULT 'all_season',
  occasion TEXT NOT NULL DEFAULT 'casual',
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS canonical_outfit_entries (
  entry_id UUID NOT NULL,
  outfit_id UUID NOT NULL,
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  layer_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE canonical_outfits
  ADD COLUMN IF NOT EXISTS outfit_id UUID,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS style TEXT DEFAULT 'casual',
  ADD COLUMN IF NOT EXISTS season TEXT DEFAULT 'all_season',
  ADD COLUMN IF NOT EXISTS occasion TEXT DEFAULT 'casual',
  ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS revision BIGINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE canonical_outfit_entries
  ADD COLUMN IF NOT EXISTS entry_id UUID,
  ADD COLUMN IF NOT EXISTS outfit_id UUID,
  ADD COLUMN IF NOT EXISTS garment_id UUID,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS layer_role TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Canonical-owned CHECKs are replaced inside this transaction before any
-- backfill. If later validation fails, PostgreSQL restores the prior schema and
-- data atomically rather than leaving a partially repaired authority.
ALTER TABLE canonical_outfits
  DROP CONSTRAINT IF EXISTS canonical_outfits_name_check,
  DROP CONSTRAINT IF EXISTS canonical_outfits_style_check,
  DROP CONSTRAINT IF EXISTS canonical_outfits_season_check,
  DROP CONSTRAINT IF EXISTS canonical_outfits_occasion_check,
  DROP CONSTRAINT IF EXISTS canonical_outfits_status_check,
  DROP CONSTRAINT IF EXISTS canonical_outfits_revision_check;
ALTER TABLE canonical_outfit_entries
  DROP CONSTRAINT IF EXISTS canonical_outfit_entries_position_check,
  DROP CONSTRAINT IF EXISTS canonical_outfit_entries_layer_role_check;

UPDATE canonical_outfits SET style='casual' WHERE style IS NULL;
UPDATE canonical_outfits SET season='all_season' WHERE season IS NULL;
UPDATE canonical_outfits SET occasion='casual' WHERE occasion IS NULL;
UPDATE canonical_outfits SET favorite=FALSE WHERE favorite IS NULL;
UPDATE canonical_outfits SET status='ACTIVE' WHERE status IS NULL;
UPDATE canonical_outfits SET revision=1 WHERE revision IS NULL;
UPDATE canonical_outfits SET created_at=CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE canonical_outfits SET updated_at=CURRENT_TIMESTAMP WHERE updated_at IS NULL;
UPDATE canonical_outfit_entries SET created_at=CURRENT_TIMESTAMP WHERE created_at IS NULL;

ALTER TABLE canonical_outfits
  ALTER COLUMN outfit_id DROP DEFAULT,
  ALTER COLUMN tenant_id DROP DEFAULT,
  ALTER COLUMN user_id DROP DEFAULT,
  ALTER COLUMN name DROP DEFAULT,
  ALTER COLUMN style SET DEFAULT 'casual',
  ALTER COLUMN season SET DEFAULT 'all_season',
  ALTER COLUMN occasion SET DEFAULT 'casual',
  ALTER COLUMN favorite SET DEFAULT FALSE,
  ALTER COLUMN status SET DEFAULT 'ACTIVE',
  ALTER COLUMN revision SET DEFAULT 1,
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN deleted_at DROP DEFAULT,
  ALTER COLUMN outfit_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN style SET NOT NULL,
  ALTER COLUMN season SET NOT NULL,
  ALTER COLUMN occasion SET NOT NULL,
  ALTER COLUMN favorite SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN revision SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE canonical_outfit_entries
  ALTER COLUMN entry_id DROP DEFAULT,
  ALTER COLUMN outfit_id DROP DEFAULT,
  ALTER COLUMN garment_id DROP DEFAULT,
  ALTER COLUMN tenant_id DROP DEFAULT,
  ALTER COLUMN user_id DROP DEFAULT,
  ALTER COLUMN position DROP DEFAULT,
  ALTER COLUMN layer_role DROP DEFAULT,
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN entry_id SET NOT NULL,
  ALTER COLUMN outfit_id SET NOT NULL,
  ALTER COLUMN garment_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN position SET NOT NULL,
  ALTER COLUMN layer_role SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

DO $$
DECLARE
  constraint_name TEXT;
  constraint_definition TEXT;
  correct_name TEXT;
BEGIN
  SELECT conname,pg_get_constraintdef(oid)
    INTO constraint_name,constraint_definition
    FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfits') AND contype='p'
    LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    IF constraint_definition='PRIMARY KEY (outfit_id)' THEN
      IF constraint_name<>'canonical_outfits_pkey' THEN
        EXECUTE format('ALTER TABLE canonical_outfits RENAME CONSTRAINT %I TO canonical_outfits_pkey', constraint_name);
      END IF;
    ELSE
      EXECUTE format('ALTER TABLE canonical_outfits DROP CONSTRAINT %I', constraint_name);
    END IF;
  END IF;

  constraint_name := NULL;
  constraint_definition := NULL;
  SELECT conname,pg_get_constraintdef(oid)
    INTO constraint_name,constraint_definition
    FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries') AND contype='p'
    LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    IF constraint_definition='PRIMARY KEY (entry_id)' THEN
      IF constraint_name<>'canonical_outfit_entries_pkey' THEN
        EXECUTE format('ALTER TABLE canonical_outfit_entries RENAME CONSTRAINT %I TO canonical_outfit_entries_pkey', constraint_name);
      END IF;
    ELSE
      EXECUTE format('ALTER TABLE canonical_outfit_entries DROP CONSTRAINT %I', constraint_name);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfits')
      AND conname='canonical_outfits_owner_unique'
      AND NOT (contype='u' AND pg_get_constraintdef(oid)='UNIQUE (outfit_id, tenant_id, user_id)')
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfits DROP CONSTRAINT canonical_outfits_owner_unique';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfits')
      AND conname='canonical_outfits_owner_unique' AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (outfit_id, tenant_id, user_id)'
  ) THEN
    SELECT conname INTO correct_name
      FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits') AND contype='u'
        AND pg_get_constraintdef(oid)='UNIQUE (outfit_id, tenant_id, user_id)'
      LIMIT 1;
    IF correct_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE canonical_outfits RENAME CONSTRAINT %I TO canonical_outfits_owner_unique', correct_name);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries')
      AND conname='canonical_outfit_entries_outfit_garment_unique'
      AND NOT (contype='u' AND pg_get_constraintdef(oid)='UNIQUE (outfit_id, garment_id)')
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfit_entries DROP CONSTRAINT canonical_outfit_entries_outfit_garment_unique';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries')
      AND conname='canonical_outfit_entries_outfit_garment_unique' AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (outfit_id, garment_id)'
  ) THEN
    correct_name := NULL;
    SELECT conname INTO correct_name
      FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries') AND contype='u'
        AND pg_get_constraintdef(oid)='UNIQUE (outfit_id, garment_id)'
      LIMIT 1;
    IF correct_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE canonical_outfit_entries RENAME CONSTRAINT %I TO canonical_outfit_entries_outfit_garment_unique', correct_name);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries')
      AND conname='canonical_outfit_entries_outfit_position_unique'
      AND NOT (contype='u' AND condeferrable AND condeferred
        AND replace(pg_get_constraintdef(oid), '"', '') LIKE 'UNIQUE (outfit_id, position)%')
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfit_entries DROP CONSTRAINT canonical_outfit_entries_outfit_position_unique';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries')
      AND conname='canonical_outfit_entries_outfit_position_unique' AND contype='u'
      AND condeferrable AND condeferred
      AND replace(pg_get_constraintdef(oid), '"', '') LIKE 'UNIQUE (outfit_id, position)%'
  ) THEN
    correct_name := NULL;
    SELECT conname INTO correct_name
      FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries') AND contype='u'
        AND condeferrable AND condeferred
        AND replace(pg_get_constraintdef(oid), '"', '') LIKE 'UNIQUE (outfit_id, position)%'
      LIMIT 1;
    IF correct_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE canonical_outfit_entries RENAME CONSTRAINT %I TO canonical_outfit_entries_outfit_position_unique', correct_name);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries')
      AND conname='canonical_outfit_entries_outfit_owner_fkey'
      AND NOT (
        contype='f' AND convalidated AND confdeltype='c'
        AND confrelid=to_regclass('canonical_outfits')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (outfit_id, tenant_id, user_id) REFERENCES canonical_outfits(outfit_id, tenant_id, user_id)%ON DELETE CASCADE%'
      )
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfit_entries DROP CONSTRAINT canonical_outfit_entries_outfit_owner_fkey';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries')
      AND conname='canonical_outfit_entries_garment_owner_fkey'
      AND NOT (
        contype='f' AND convalidated AND confdeltype='r'
        AND confrelid=to_regclass('canonical_garments')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%ON DELETE RESTRICT%'
      )
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfit_entries DROP CONSTRAINT canonical_outfit_entries_garment_owner_fkey';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfits')
      AND conname='canonical_outfits_pkey' AND contype='p'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (outfit_id)'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfits ADD CONSTRAINT canonical_outfits_pkey PRIMARY KEY (outfit_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfits')
      AND conname='canonical_outfits_owner_unique' AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (outfit_id, tenant_id, user_id)'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfits ADD CONSTRAINT canonical_outfits_owner_unique UNIQUE (outfit_id, tenant_id, user_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries')
      AND conname='canonical_outfit_entries_pkey' AND contype='p'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (entry_id)'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfit_entries ADD CONSTRAINT canonical_outfit_entries_pkey PRIMARY KEY (entry_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries')
      AND conname='canonical_outfit_entries_outfit_garment_unique' AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (outfit_id, garment_id)'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfit_entries ADD CONSTRAINT canonical_outfit_entries_outfit_garment_unique UNIQUE (outfit_id, garment_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries')
      AND conname='canonical_outfit_entries_outfit_position_unique' AND contype='u'
      AND condeferrable AND condeferred
      AND replace(pg_get_constraintdef(oid), '"', '') LIKE 'UNIQUE (outfit_id, position)%'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfit_entries ADD CONSTRAINT canonical_outfit_entries_outfit_position_unique UNIQUE (outfit_id, position) DEFERRABLE INITIALLY DEFERRED';
  END IF;

  EXECUTE $ddl$ALTER TABLE canonical_outfits ADD CONSTRAINT canonical_outfits_name_check CHECK (
    char_length(name) >= 1 AND char_length(name) <= 200 AND name = btrim(name) AND name !~ '[[:cntrl:]]'
  ) NOT VALID$ddl$;
  EXECUTE $ddl$ALTER TABLE canonical_outfits ADD CONSTRAINT canonical_outfits_style_check CHECK (
    style IN ('minimal','classic','elegant','streetwear','business','luxury','sport','vintage','casual','modern','creative','smart_casual')
  ) NOT VALID$ddl$;
  EXECUTE $ddl$ALTER TABLE canonical_outfits ADD CONSTRAINT canonical_outfits_season_check CHECK (
    season IN ('all_season','spring','summer','autumn','winter')
  ) NOT VALID$ddl$;
  EXECUTE $ddl$ALTER TABLE canonical_outfits ADD CONSTRAINT canonical_outfits_occasion_check CHECK (
    occasion IN ('casual','business','formal','wedding','party','travel','sport','outdoor','streetwear','luxury','home','beach','night_out')
  ) NOT VALID$ddl$;
  EXECUTE $ddl$ALTER TABLE canonical_outfits ADD CONSTRAINT canonical_outfits_status_check CHECK (
    status IN ('ACTIVE','ARCHIVED')
  ) NOT VALID$ddl$;
  EXECUTE 'ALTER TABLE canonical_outfits ADD CONSTRAINT canonical_outfits_revision_check CHECK (revision >= 1) NOT VALID';
  EXECUTE 'ALTER TABLE canonical_outfit_entries ADD CONSTRAINT canonical_outfit_entries_position_check CHECK (position >= 0 AND position < 32) NOT VALID';
  EXECUTE $ddl$ALTER TABLE canonical_outfit_entries ADD CONSTRAINT canonical_outfit_entries_layer_role_check CHECK (
    layer_role IN ('BASE_TOP','MID_TOP','OUTER_TOP','FULL_BODY','BOTTOM','FOOTWEAR','ACCESSORY')
  ) NOT VALID$ddl$;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries') AND conname='canonical_outfit_entries_outfit_owner_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfit_entries ADD CONSTRAINT canonical_outfit_entries_outfit_owner_fkey FOREIGN KEY (outfit_id, tenant_id, user_id) REFERENCES canonical_outfits (outfit_id, tenant_id, user_id) ON DELETE CASCADE NOT VALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_outfit_entries') AND conname='canonical_outfit_entries_garment_owner_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE canonical_outfit_entries ADD CONSTRAINT canonical_outfit_entries_garment_owner_fkey FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments (garment_id, tenant_id, user_id) ON DELETE RESTRICT NOT VALID';
  END IF;
END $$;

ALTER TABLE canonical_outfits
  VALIDATE CONSTRAINT canonical_outfits_name_check,
  VALIDATE CONSTRAINT canonical_outfits_style_check,
  VALIDATE CONSTRAINT canonical_outfits_season_check,
  VALIDATE CONSTRAINT canonical_outfits_occasion_check,
  VALIDATE CONSTRAINT canonical_outfits_status_check,
  VALIDATE CONSTRAINT canonical_outfits_revision_check;
ALTER TABLE canonical_outfit_entries
  VALIDATE CONSTRAINT canonical_outfit_entries_position_check,
  VALIDATE CONSTRAINT canonical_outfit_entries_layer_role_check,
  VALIDATE CONSTRAINT canonical_outfit_entries_outfit_owner_fkey,
  VALIDATE CONSTRAINT canonical_outfit_entries_garment_owner_fkey;

DO $$
BEGIN
  IF to_regclass('canonical_outfits_owner_updated_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid
    JOIN pg_am am ON am.oid=ic.relam
    WHERE i.indexrelid=to_regclass('canonical_outfits_owner_updated_idx')
      AND i.indisvalid AND i.indisready AND NOT i.indisunique AND NOT i.indisprimary
      AND am.amname='btree' AND i.indpred IS NULL AND i.indexprs IS NULL
      AND ARRAY(
        SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
        WHERE k.ord <= i.indnkeyatts ORDER BY k.ord
      ) = ARRAY['tenant_id','user_id','updated_at','outfit_id']::name[]
      AND ARRAY(
        SELECT o.option FROM unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(option,ord)
        WHERE o.ord <= i.indnkeyatts ORDER BY o.ord
      ) = ARRAY[0,0,3,0]::smallint[]
  ) THEN
    EXECUTE 'DROP INDEX canonical_outfits_owner_updated_idx';
  END IF;

  IF to_regclass('canonical_outfit_entries_owner_order_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid
    JOIN pg_am am ON am.oid=ic.relam
    WHERE i.indexrelid=to_regclass('canonical_outfit_entries_owner_order_idx')
      AND i.indisvalid AND i.indisready AND NOT i.indisunique AND NOT i.indisprimary
      AND am.amname='btree' AND i.indpred IS NULL AND i.indexprs IS NULL
      AND ARRAY(
        SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
        WHERE k.ord <= i.indnkeyatts ORDER BY k.ord
      ) = ARRAY['tenant_id','user_id','outfit_id','position','entry_id']::name[]
      AND ARRAY(
        SELECT o.option FROM unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(option,ord)
        WHERE o.ord <= i.indnkeyatts ORDER BY o.ord
      ) = ARRAY[0,0,0,0,0]::smallint[]
  ) THEN
    EXECUTE 'DROP INDEX canonical_outfit_entries_owner_order_idx';
  END IF;

  IF to_regclass('canonical_outfit_entries_garment_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class ic ON ic.oid=i.indexrelid
    JOIN pg_am am ON am.oid=ic.relam
    WHERE i.indexrelid=to_regclass('canonical_outfit_entries_garment_idx')
      AND i.indisvalid AND i.indisready AND NOT i.indisunique AND NOT i.indisprimary
      AND am.amname='btree' AND i.indpred IS NULL AND i.indexprs IS NULL
      AND ARRAY(
        SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
        WHERE k.ord <= i.indnkeyatts ORDER BY k.ord
      ) = ARRAY['tenant_id','user_id','garment_id','outfit_id','entry_id']::name[]
      AND ARRAY(
        SELECT o.option FROM unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(option,ord)
        WHERE o.ord <= i.indnkeyatts ORDER BY o.ord
      ) = ARRAY[0,0,0,0,0]::smallint[]
  ) THEN
    EXECUTE 'DROP INDEX canonical_outfit_entries_garment_idx';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS canonical_outfits_owner_updated_idx
  ON canonical_outfits (tenant_id, user_id, updated_at DESC, outfit_id);
CREATE INDEX IF NOT EXISTS canonical_outfit_entries_owner_order_idx
  ON canonical_outfit_entries (tenant_id, user_id, outfit_id, position, entry_id);
CREATE INDEX IF NOT EXISTS canonical_outfit_entries_garment_idx
  ON canonical_outfit_entries (tenant_id, user_id, garment_id, outfit_id, entry_id);

COMMIT;
