BEGIN;

CREATE TABLE IF NOT EXISTS canonical_garment_representations (
  representation_id UUID NOT NULL,
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  format TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  byte_size BIGINT NOT NULL,
  storage_backend TEXT NOT NULL DEFAULT 'POSTGRES_BYTEA_V1',
  representation_bytes BYTEA NOT NULL,
  basis_view_id UUID NOT NULL,
  source_count INTEGER NOT NULL,
  generator_id TEXT NOT NULL,
  generator_version TEXT NOT NULL,
  validator_id TEXT NOT NULL,
  validator_version TEXT NOT NULL,
  admission_state TEXT NOT NULL DEFAULT 'ADMITTED',
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS canonical_garment_representation_sources (
  representation_id UUID NOT NULL,
  garment_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source_position INTEGER NOT NULL,
  view_id UUID NOT NULL,
  source_content_sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Repair never invents identity, owner, provenance, admission, payload or lineage facts.
-- Missing columns are added without defaults; existing incomplete rows therefore fail
-- SET NOT NULL and roll the whole migration back instead of being legitimized.
ALTER TABLE canonical_garment_representations
  ADD COLUMN IF NOT EXISTS representation_id UUID,
  ADD COLUMN IF NOT EXISTS garment_id UUID,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS tier TEXT,
  ADD COLUMN IF NOT EXISTS format TEXT,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS content_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS byte_size BIGINT,
  ADD COLUMN IF NOT EXISTS storage_backend TEXT,
  ADD COLUMN IF NOT EXISTS representation_bytes BYTEA,
  ADD COLUMN IF NOT EXISTS basis_view_id UUID,
  ADD COLUMN IF NOT EXISTS source_count INTEGER,
  ADD COLUMN IF NOT EXISTS generator_id TEXT,
  ADD COLUMN IF NOT EXISTS generator_version TEXT,
  ADD COLUMN IF NOT EXISTS validator_id TEXT,
  ADD COLUMN IF NOT EXISTS validator_version TEXT,
  ADD COLUMN IF NOT EXISTS admission_state TEXT,
  ADD COLUMN IF NOT EXISTS admitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE canonical_garment_representation_sources
  ADD COLUMN IF NOT EXISTS representation_id UUID,
  ADD COLUMN IF NOT EXISTS garment_id UUID,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS source_position INTEGER,
  ADD COLUMN IF NOT EXISTS view_id UUID,
  ADD COLUMN IF NOT EXISTS source_content_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE canonical_garment_representations
  ALTER COLUMN representation_id DROP DEFAULT,
  ALTER COLUMN garment_id DROP DEFAULT,
  ALTER COLUMN tenant_id DROP DEFAULT,
  ALTER COLUMN user_id DROP DEFAULT,
  ALTER COLUMN tier DROP DEFAULT,
  ALTER COLUMN format DROP DEFAULT,
  ALTER COLUMN content_type DROP DEFAULT,
  ALTER COLUMN content_sha256 DROP DEFAULT,
  ALTER COLUMN byte_size DROP DEFAULT,
  ALTER COLUMN storage_backend SET DEFAULT 'POSTGRES_BYTEA_V1',
  ALTER COLUMN representation_bytes DROP DEFAULT,
  ALTER COLUMN basis_view_id DROP DEFAULT,
  ALTER COLUMN source_count DROP DEFAULT,
  ALTER COLUMN generator_id DROP DEFAULT,
  ALTER COLUMN generator_version DROP DEFAULT,
  ALTER COLUMN validator_id DROP DEFAULT,
  ALTER COLUMN validator_version DROP DEFAULT,
  ALTER COLUMN admission_state SET DEFAULT 'ADMITTED',
  ALTER COLUMN admitted_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN revoked_at DROP DEFAULT,
  ALTER COLUMN representation_id SET NOT NULL,
  ALTER COLUMN garment_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN tier SET NOT NULL,
  ALTER COLUMN format SET NOT NULL,
  ALTER COLUMN content_type SET NOT NULL,
  ALTER COLUMN content_sha256 SET NOT NULL,
  ALTER COLUMN byte_size SET NOT NULL,
  ALTER COLUMN storage_backend SET NOT NULL,
  ALTER COLUMN representation_bytes SET NOT NULL,
  ALTER COLUMN basis_view_id SET NOT NULL,
  ALTER COLUMN source_count SET NOT NULL,
  ALTER COLUMN generator_id SET NOT NULL,
  ALTER COLUMN generator_version SET NOT NULL,
  ALTER COLUMN validator_id SET NOT NULL,
  ALTER COLUMN validator_version SET NOT NULL,
  ALTER COLUMN admission_state SET NOT NULL,
  ALTER COLUMN admitted_at SET NOT NULL;
ALTER TABLE canonical_garment_representation_sources
  ALTER COLUMN representation_id DROP DEFAULT,
  ALTER COLUMN garment_id DROP DEFAULT,
  ALTER COLUMN tenant_id DROP DEFAULT,
  ALTER COLUMN user_id DROP DEFAULT,
  ALTER COLUMN source_position DROP DEFAULT,
  ALTER COLUMN view_id DROP DEFAULT,
  ALTER COLUMN source_content_sha256 DROP DEFAULT,
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN representation_id SET NOT NULL,
  ALTER COLUMN garment_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN source_position SET NOT NULL,
  ALTER COLUMN view_id SET NOT NULL,
  ALTER COLUMN source_content_sha256 SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

-- Drop canonical FKs before rebuilding unique keys they depend on.
ALTER TABLE canonical_garment_representation_sources
  DROP CONSTRAINT IF EXISTS canonical_garment_representation_sources_representation_fkey,
  DROP CONSTRAINT IF EXISTS canonical_garment_representation_sources_view_evidence_fkey;
ALTER TABLE canonical_garment_representations
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_garment_owner_fkey,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_basis_view_fkey;

DO $$
DECLARE n TEXT; d TEXT;
BEGIN
  SELECT conname,pg_get_constraintdef(oid) INTO n,d FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_representations') AND contype='p' LIMIT 1;
  IF n IS NOT NULL AND d<>'PRIMARY KEY (representation_id)' THEN EXECUTE format('ALTER TABLE canonical_garment_representations DROP CONSTRAINT %I',n); n:=NULL; END IF;
  IF n IS NOT NULL AND n<>'canonical_garment_representations_pkey' THEN EXECUTE format('ALTER TABLE canonical_garment_representations RENAME CONSTRAINT %I TO canonical_garment_representations_pkey',n); END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_garment_representations') AND contype='p') THEN
    ALTER TABLE canonical_garment_representations ADD CONSTRAINT canonical_garment_representations_pkey PRIMARY KEY(representation_id);
  END IF;
  n:=NULL; d:=NULL;
  SELECT conname,pg_get_constraintdef(oid) INTO n,d FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_garment_representation_sources') AND contype='p' LIMIT 1;
  IF n IS NOT NULL AND d<>'PRIMARY KEY (representation_id, source_position)' THEN EXECUTE format('ALTER TABLE canonical_garment_representation_sources DROP CONSTRAINT %I',n); n:=NULL; END IF;
  IF n IS NOT NULL AND n<>'canonical_garment_representation_sources_pkey' THEN EXECUTE format('ALTER TABLE canonical_garment_representation_sources RENAME CONSTRAINT %I TO canonical_garment_representation_sources_pkey',n); END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_garment_representation_sources') AND contype='p') THEN
    ALTER TABLE canonical_garment_representation_sources ADD CONSTRAINT canonical_garment_representation_sources_pkey PRIMARY KEY(representation_id,source_position);
  END IF;
END $$;

ALTER TABLE canonical_garment_representations
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_owner_unique,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_garment_content_unique;
ALTER TABLE canonical_garment_representation_sources
  DROP CONSTRAINT IF EXISTS canonical_garment_representation_sources_view_unique;
ALTER TABLE canonical_garment_views
  DROP CONSTRAINT IF EXISTS canonical_garment_views_representation_source_unique;
ALTER TABLE canonical_garment_representations
  ADD CONSTRAINT canonical_garment_representations_owner_unique UNIQUE(representation_id,garment_id,tenant_id,user_id),
  ADD CONSTRAINT canonical_garment_representations_garment_content_unique UNIQUE(garment_id,content_sha256,basis_view_id);
ALTER TABLE canonical_garment_representation_sources
  ADD CONSTRAINT canonical_garment_representation_sources_view_unique UNIQUE(representation_id,view_id);
ALTER TABLE canonical_garment_views
  ADD CONSTRAINT canonical_garment_views_representation_source_unique UNIQUE(view_id,garment_id,tenant_id,user_id,content_sha256);

ALTER TABLE canonical_garment_representations
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_tier_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_format_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_format_content_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_sha_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_payload_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_storage_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_source_count_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_generator_id_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_generator_version_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_validator_id_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_validator_version_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_state_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_state_time_check;
ALTER TABLE canonical_garment_representation_sources
  DROP CONSTRAINT IF EXISTS canonical_garment_representation_sources_position_check,
  DROP CONSTRAINT IF EXISTS canonical_garment_representation_sources_sha_check;
ALTER TABLE canonical_garment_representations
  ADD CONSTRAINT canonical_garment_representations_tier_check CHECK(tier=ANY(ARRAY['PARAMETRIC'::text,'FULL_3D'::text])),
  ADD CONSTRAINT canonical_garment_representations_format_check CHECK(format=ANY(ARRAY['BERS_PARAMETRIC_V1'::text,'GLB_2_0'::text])),
  ADD CONSTRAINT canonical_garment_representations_format_content_check CHECK((tier='PARAMETRIC' AND format='BERS_PARAMETRIC_V1' AND content_type='application/vnd.bers.garment-parametric+json') OR (tier='FULL_3D' AND format='GLB_2_0' AND content_type='model/gltf-binary')),
  ADD CONSTRAINT canonical_garment_representations_sha_check CHECK(content_sha256~'^[0-9a-f]{64}$'),
  ADD CONSTRAINT canonical_garment_representations_payload_check CHECK(byte_size>=1 AND byte_size<=67108864 AND octet_length(representation_bytes)=byte_size),
  ADD CONSTRAINT canonical_garment_representations_storage_check CHECK(storage_backend='POSTGRES_BYTEA_V1'),
  ADD CONSTRAINT canonical_garment_representations_source_count_check CHECK(source_count>=1 AND source_count<=32),
  ADD CONSTRAINT canonical_garment_representations_generator_id_check CHECK(char_length(generator_id)>=1 AND char_length(generator_id)<=100 AND generator_id=btrim(generator_id) AND generator_id!~'[[:cntrl:]]'),
  ADD CONSTRAINT canonical_garment_representations_generator_version_check CHECK(char_length(generator_version)>=1 AND char_length(generator_version)<=100 AND generator_version=btrim(generator_version) AND generator_version!~'[[:cntrl:]]'),
  ADD CONSTRAINT canonical_garment_representations_validator_id_check CHECK(char_length(validator_id)>=1 AND char_length(validator_id)<=100 AND validator_id=btrim(validator_id) AND validator_id!~'[[:cntrl:]]'),
  ADD CONSTRAINT canonical_garment_representations_validator_version_check CHECK(char_length(validator_version)>=1 AND char_length(validator_version)<=100 AND validator_version=btrim(validator_version) AND validator_version!~'[[:cntrl:]]'),
  ADD CONSTRAINT canonical_garment_representations_state_check CHECK(admission_state=ANY(ARRAY['ADMITTED'::text,'REVOKED'::text])),
  ADD CONSTRAINT canonical_garment_representations_state_time_check CHECK((admission_state='ADMITTED' AND revoked_at IS NULL) OR (admission_state='REVOKED' AND revoked_at IS NOT NULL));
ALTER TABLE canonical_garment_representation_sources
  ADD CONSTRAINT canonical_garment_representation_sources_position_check CHECK(source_position>=0 AND source_position<32),
  ADD CONSTRAINT canonical_garment_representation_sources_sha_check CHECK(source_content_sha256~'^[0-9a-f]{64}$');

ALTER TABLE canonical_garment_representations
  ADD CONSTRAINT canonical_garment_representations_garment_owner_fkey FOREIGN KEY(garment_id,tenant_id,user_id) REFERENCES canonical_garments(garment_id,tenant_id,user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT canonical_garment_representations_basis_view_fkey FOREIGN KEY(basis_view_id,garment_id,tenant_id,user_id) REFERENCES canonical_garment_views(view_id,garment_id,tenant_id,user_id) ON DELETE RESTRICT;
ALTER TABLE canonical_garment_representation_sources
  ADD CONSTRAINT canonical_garment_representation_sources_representation_fkey FOREIGN KEY(representation_id,garment_id,tenant_id,user_id) REFERENCES canonical_garment_representations(representation_id,garment_id,tenant_id,user_id) ON DELETE CASCADE,
  ADD CONSTRAINT canonical_garment_representation_sources_view_evidence_fkey FOREIGN KEY(view_id,garment_id,tenant_id,user_id,source_content_sha256) REFERENCES canonical_garment_views(view_id,garment_id,tenant_id,user_id,content_sha256) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION canonical_garment_representation_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.admission_state<>'ADMITTED' OR NEW.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'canonical garment representations must be created admitted and unrevoked'; END IF;
    IF NOT EXISTS(SELECT 1 FROM canonical_garments g WHERE g.garment_id=NEW.garment_id AND g.tenant_id=NEW.tenant_id AND g.user_id=NEW.user_id AND g.deleted_at IS NULL AND g.status='ACTIVE' AND g.category<>'other' AND g.primary_view_id=NEW.basis_view_id) THEN
      RAISE EXCEPTION 'advanced garment representation admission requires an active classified garment and its current primary view';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'canonical garment representations are immutable; revoke instead'; END IF;
  IF NEW.representation_id IS DISTINCT FROM OLD.representation_id OR NEW.garment_id IS DISTINCT FROM OLD.garment_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.tier IS DISTINCT FROM OLD.tier OR NEW.format IS DISTINCT FROM OLD.format OR NEW.content_type IS DISTINCT FROM OLD.content_type OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 OR NEW.byte_size IS DISTINCT FROM OLD.byte_size OR NEW.storage_backend IS DISTINCT FROM OLD.storage_backend OR NEW.representation_bytes IS DISTINCT FROM OLD.representation_bytes OR NEW.basis_view_id IS DISTINCT FROM OLD.basis_view_id OR NEW.source_count IS DISTINCT FROM OLD.source_count OR NEW.generator_id IS DISTINCT FROM OLD.generator_id OR NEW.generator_version IS DISTINCT FROM OLD.generator_version OR NEW.validator_id IS DISTINCT FROM OLD.validator_id OR NEW.validator_version IS DISTINCT FROM OLD.validator_version OR NEW.admitted_at IS DISTINCT FROM OLD.admitted_at THEN
    RAISE EXCEPTION 'canonical garment representation identity/provenance/payload is immutable';
  END IF;
  IF OLD.admission_state='REVOKED' AND NEW.admission_state IS DISTINCT FROM OLD.admission_state THEN RAISE EXCEPTION 'revoked garment representations cannot be re-admitted'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION canonical_garment_representation_source_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM canonical_garment_views v WHERE v.view_id=NEW.view_id AND v.garment_id=NEW.garment_id AND v.tenant_id=NEW.tenant_id AND v.user_id=NEW.user_id AND v.content_sha256=NEW.source_content_sha256 AND v.revoked_at IS NULL AND v.deleted_at IS NULL) THEN RAISE EXCEPTION 'garment representation sources must be current managed views with exact content identity'; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'canonical garment representation source lineage is immutable';
END $$;
CREATE OR REPLACE FUNCTION canonical_assert_garment_representation_sources()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid UUID; basis UUID; expected_count INTEGER; actual_count INTEGER; min_pos INTEGER; max_pos INTEGER; basis_count INTEGER;
BEGIN
  rid:=CASE WHEN TG_OP='DELETE' THEN OLD.representation_id ELSE NEW.representation_id END;
  SELECT basis_view_id,source_count INTO basis,expected_count FROM canonical_garment_representations WHERE representation_id=rid;
  IF basis IS NULL THEN RETURN NULL; END IF;
  SELECT COUNT(*)::integer,MIN(source_position),MAX(source_position),COUNT(*) FILTER(WHERE view_id=basis)::integer INTO actual_count,min_pos,max_pos,basis_count FROM canonical_garment_representation_sources WHERE representation_id=rid;
  IF actual_count<>expected_count OR min_pos<>0 OR max_pos<>expected_count-1 OR basis_count<>1 THEN RAISE EXCEPTION 'canonical garment representation source set must be dense, exact-count and include basis view'; END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION canonical_assert_garment_representation_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid UUID; tenant TEXT; usr TEXT; actual TEXT; expected TEXT;
BEGIN
  IF TG_TABLE_NAME='canonical_garments' THEN gid:=NEW.garment_id;tenant:=NEW.tenant_id;usr:=NEW.user_id; ELSE gid:=CASE WHEN TG_OP='DELETE' THEN OLD.garment_id ELSE NEW.garment_id END;tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;usr:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END; END IF;
  SELECT representation_tier INTO actual FROM canonical_garments WHERE garment_id=gid AND tenant_id=tenant AND user_id=usr;
  IF actual IS NULL THEN RETURN NULL; END IF;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM canonical_garment_representations r WHERE r.garment_id=gid AND r.tenant_id=tenant AND r.user_id=usr AND r.admission_state='ADMITTED' AND r.tier='FULL_3D') THEN 'FULL_3D' WHEN EXISTS(SELECT 1 FROM canonical_garment_representations r WHERE r.garment_id=gid AND r.tenant_id=tenant AND r.user_id=usr AND r.admission_state='ADMITTED' AND r.tier='PARAMETRIC') THEN 'PARAMETRIC' ELSE 'BASIC' END INTO expected;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'canonical_garments.representation_tier is a derived summary and does not match admitted representation evidence'; END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS canonical_garment_representations_immutable_guard ON canonical_garment_representations;
CREATE TRIGGER canonical_garment_representations_immutable_guard BEFORE INSERT OR UPDATE OR DELETE ON canonical_garment_representations FOR EACH ROW EXECUTE FUNCTION canonical_garment_representation_immutable_guard();
DROP TRIGGER IF EXISTS canonical_garment_representation_sources_immutable_guard ON canonical_garment_representation_sources;
CREATE TRIGGER canonical_garment_representation_sources_immutable_guard BEFORE INSERT OR UPDATE OR DELETE ON canonical_garment_representation_sources FOR EACH ROW EXECUTE FUNCTION canonical_garment_representation_source_immutable_guard();
DROP TRIGGER IF EXISTS canonical_garment_representations_source_set_check ON canonical_garment_representations;
CREATE CONSTRAINT TRIGGER canonical_garment_representations_source_set_check AFTER INSERT OR UPDATE ON canonical_garment_representations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_assert_garment_representation_sources();
DROP TRIGGER IF EXISTS canonical_garment_representation_sources_source_set_check ON canonical_garment_representation_sources;
CREATE CONSTRAINT TRIGGER canonical_garment_representation_sources_source_set_check AFTER INSERT OR UPDATE ON canonical_garment_representation_sources DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_assert_garment_representation_sources();
DROP TRIGGER IF EXISTS canonical_garments_representation_summary_check ON canonical_garments;
CREATE CONSTRAINT TRIGGER canonical_garments_representation_summary_check AFTER INSERT OR UPDATE ON canonical_garments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_assert_garment_representation_summary();
DROP TRIGGER IF EXISTS canonical_garment_representations_summary_check ON canonical_garment_representations;
CREATE CONSTRAINT TRIGGER canonical_garment_representations_summary_check AFTER INSERT OR UPDATE ON canonical_garment_representations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_assert_garment_representation_summary();

DROP INDEX IF EXISTS canonical_garment_representations_owner_garment_idx;
CREATE INDEX canonical_garment_representations_owner_garment_idx ON canonical_garment_representations(tenant_id,user_id,garment_id,admission_state,tier,admitted_at DESC,representation_id);
DROP INDEX IF EXISTS canonical_garment_representation_sources_owner_idx;
CREATE INDEX canonical_garment_representation_sources_owner_idx ON canonical_garment_representation_sources(tenant_id,user_id,garment_id,representation_id,source_position);
DROP INDEX IF EXISTS canonical_garment_representation_sources_view_idx;
CREATE INDEX canonical_garment_representation_sources_view_idx ON canonical_garment_representation_sources(tenant_id,user_id,view_id,representation_id);

-- Constraint triggers do not validate pre-existing rows retroactively.
DO $$
DECLARE bad_rep UUID; bad_garment UUID;
BEGIN
  SELECT r.representation_id INTO bad_rep FROM canonical_garment_representations r LEFT JOIN LATERAL(SELECT COUNT(*)::integer AS n,MIN(s.source_position) AS lo,MAX(s.source_position) AS hi,COUNT(*) FILTER(WHERE s.view_id=r.basis_view_id)::integer AS basis_n FROM canonical_garment_representation_sources s WHERE s.representation_id=r.representation_id) q ON TRUE WHERE q.n<>r.source_count OR q.lo<>0 OR q.hi<>r.source_count-1 OR q.basis_n<>1 LIMIT 1;
  IF bad_rep IS NOT NULL THEN RAISE EXCEPTION 'existing canonical garment representation has invalid source lineage: %',bad_rep; END IF;
  SELECT g.garment_id INTO bad_garment FROM canonical_garments g WHERE g.representation_tier IS DISTINCT FROM CASE WHEN EXISTS(SELECT 1 FROM canonical_garment_representations r WHERE r.garment_id=g.garment_id AND r.tenant_id=g.tenant_id AND r.user_id=g.user_id AND r.admission_state='ADMITTED' AND r.tier='FULL_3D') THEN 'FULL_3D' WHEN EXISTS(SELECT 1 FROM canonical_garment_representations r WHERE r.garment_id=g.garment_id AND r.tenant_id=g.tenant_id AND r.user_id=g.user_id AND r.admission_state='ADMITTED' AND r.tier='PARAMETRIC') THEN 'PARAMETRIC' ELSE 'BASIC' END LIMIT 1;
  IF bad_garment IS NOT NULL THEN RAISE EXCEPTION 'existing canonical garment representation tier summary lacks matching admitted evidence: %',bad_garment; END IF;
END $$;

COMMIT;