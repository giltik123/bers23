BEGIN;

CREATE TABLE canonical_auth_users (
  user_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  email_normalized text NOT NULL UNIQUE,
  email text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (email_normalized = lower(email_normalized)),
  CHECK (length(email_normalized) BETWEEN 3 AND 320),
  CHECK (length(email) BETWEEN 3 AND 320)
);

CREATE TABLE canonical_auth_password_credentials (
  user_id text PRIMARY KEY REFERENCES canonical_auth_users(user_id) ON DELETE CASCADE,
  algorithm text NOT NULL CHECK (algorithm = 'scrypt-v1'),
  salt bytea NOT NULL CHECK (octet_length(salt) >= 16),
  password_hash bytea NOT NULL CHECK (octet_length(password_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE canonical_auth_sessions (
  session_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES canonical_auth_users(user_id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL,
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX canonical_auth_sessions_active_idx
  ON canonical_auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX canonical_auth_sessions_tenant_idx
  ON canonical_auth_sessions (tenant_id, user_id);

REVOKE ALL ON canonical_auth_users, canonical_auth_password_credentials, canonical_auth_sessions FROM PUBLIC;

COMMIT;
