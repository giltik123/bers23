BEGIN;

ALTER TABLE canonical_auth_users
  DROP CONSTRAINT IF EXISTS canonical_auth_users_status_check;
ALTER TABLE canonical_auth_users
  ADD CONSTRAINT canonical_auth_users_status_check
  CHECK (status IN ('pending_verification','active','disabled'));
ALTER TABLE canonical_auth_users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE canonical_auth_email_verifications (
  user_id text PRIMARY KEY REFERENCES canonical_auth_users(user_id) ON DELETE CASCADE,
  challenge_digest bytea NOT NULL CHECK (octet_length(challenge_digest) = 32),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  last_sent_at timestamptz NOT NULL,
  send_count integer NOT NULL DEFAULT 1 CHECK (send_count BETWEEN 1 AND 20),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 20),
  consumed_at timestamptz,
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE TABLE canonical_auth_password_resets (
  reset_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES canonical_auth_users(user_id) ON DELETE CASCADE,
  token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  consumed_at timestamptz,
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX canonical_auth_password_resets_user_idx
  ON canonical_auth_password_resets(user_id, created_at DESC);

CREATE TABLE canonical_auth_oauth_identities (
  provider text NOT NULL CHECK (provider = 'google'),
  provider_subject text NOT NULL,
  user_id text NOT NULL REFERENCES canonical_auth_users(user_id) ON DELETE CASCADE,
  email_at_link text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(provider, provider_subject),
  UNIQUE(provider, user_id)
);

CREATE TABLE canonical_auth_oauth_states (
  state_digest bytea PRIMARY KEY CHECK (octet_length(state_digest) = 32),
  nonce_digest bytea NOT NULL CHECK (octet_length(nonce_digest) = 32),
  return_to text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  consumed_at timestamptz,
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE TABLE canonical_auth_browser_grants (
  grant_digest bytea PRIMARY KEY CHECK (octet_length(grant_digest) = 32),
  user_id text NOT NULL REFERENCES canonical_auth_users(user_id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  consumed_at timestamptz,
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

REVOKE ALL ON canonical_auth_email_verifications,
  canonical_auth_password_resets,
  canonical_auth_oauth_identities,
  canonical_auth_oauth_states,
  canonical_auth_browser_grants FROM PUBLIC;

COMMIT;
