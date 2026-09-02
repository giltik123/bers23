BEGIN;

-- A representation's payload identity is evidence-bound to its basis view. The same
-- canonical geometry bytes may be admitted again after a genuine primary-view change,
-- but same bytes on the same basis remain a single immutable evidence identity.
ALTER TABLE canonical_garment_representations
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_garment_content_unique;
ALTER TABLE canonical_garment_representations
  ADD CONSTRAINT canonical_garment_representations_garment_content_unique
  UNIQUE(garment_id,content_sha256,basis_view_id);

COMMIT;
