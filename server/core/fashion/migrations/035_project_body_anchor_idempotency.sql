BEGIN;

ALTER TABLE canonical_project_body_anchor_sets
  ADD COLUMN idempotency_key uuid,
  ADD COLUMN idempotency_binding_sha256 character(64),
  ADD CONSTRAINT canonical_project_body_anchor_sets_idempotency_binding_check CHECK (
    (idempotency_key IS NULL AND idempotency_binding_sha256 IS NULL)
    OR (
      idempotency_key IS NOT NULL
      AND idempotency_binding_sha256 IS NOT NULL
      AND idempotency_binding_sha256 ~ '^[0-9a-f]{64}$'
    )
  );

-- Historical/non-product rows remain nullable. Canonical manual body-anchor
-- acquisition supplies both values. Owner-global uniqueness prevents a transport
-- intent from being rebound to another Project/source/payload after a lost ACK.
CREATE UNIQUE INDEX canonical_project_body_anchor_sets_owner_idempotency_key_unique
  ON canonical_project_body_anchor_sets (tenant_id, user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
