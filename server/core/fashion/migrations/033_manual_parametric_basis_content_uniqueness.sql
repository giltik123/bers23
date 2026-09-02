BEGIN;

-- F4b.6c.1a: representation content identity is view-bound evidence.
-- The historical garment-wide key prevented the same deterministic geometry bytes
-- from being admitted after a genuine primary-view change. Rebuild the canonical
-- key so replay uniqueness is exact to garment + canonical bytes + basis evidence.
ALTER TABLE canonical_garment_representations
  DROP CONSTRAINT IF EXISTS canonical_garment_representations_garment_content_unique;

ALTER TABLE canonical_garment_representations
  ADD CONSTRAINT canonical_garment_representations_garment_content_unique
  UNIQUE(garment_id,content_sha256,basis_view_id);

COMMIT;
