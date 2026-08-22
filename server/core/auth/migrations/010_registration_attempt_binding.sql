BEGIN;

ALTER TABLE canonical_auth_email_verifications
  ADD COLUMN verification_handle_digest bytea;

UPDATE canonical_auth_email_verifications
SET verification_handle_digest = challenge_digest
WHERE verification_handle_digest IS NULL;

ALTER TABLE canonical_auth_email_verifications
  ALTER COLUMN verification_handle_digest SET NOT NULL,
  ADD CONSTRAINT canonical_auth_email_verifications_handle_digest_length
    CHECK (octet_length(verification_handle_digest) = 32);

COMMIT;
