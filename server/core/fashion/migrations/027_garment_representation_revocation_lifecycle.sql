BEGIN;

CREATE OR REPLACE FUNCTION canonical_garment_representation_revocation_guard()
RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF OLD.admission_state='REVOKED' THEN IF NEW.admission_state IS DISTINCT FROM OLD.admission_state OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN RAISE EXCEPTION 'revoked garment representation lifecycle is immutable'; END IF; RETURN NEW; END IF; IF NEW.admission_state='ADMITTED' THEN IF NEW.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'admitted garment representation cannot carry a revocation timestamp'; END IF; RETURN NEW; END IF; IF NEW.admission_state='REVOKED' THEN NEW.revoked_at:=CURRENT_TIMESTAMP; RETURN NEW; END IF; RAISE EXCEPTION 'canonical garment representation lifecycle transition is invalid'; END;$$;

DROP TRIGGER IF EXISTS canonical_garment_representations_revocation_guard ON canonical_garment_representations;
CREATE TRIGGER canonical_garment_representations_revocation_guard
  BEFORE UPDATE ON canonical_garment_representations
  FOR EACH ROW
  EXECUTE FUNCTION canonical_garment_representation_revocation_guard();

COMMIT;
