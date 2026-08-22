BEGIN;

CREATE TABLE canonical_auth_rate_limits (
  scope text NOT NULL,
  subject_digest bytea NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (scope, subject_digest),
  CHECK (length(scope) BETWEEN 1 AND 80),
  CHECK (octet_length(subject_digest) = 32),
  CHECK (blocked_until IS NULL OR blocked_until >= window_started_at)
);

CREATE INDEX canonical_auth_rate_limits_blocked_idx
  ON canonical_auth_rate_limits (blocked_until)
  WHERE blocked_until IS NOT NULL;

CREATE INDEX canonical_auth_rate_limits_updated_idx
  ON canonical_auth_rate_limits (updated_at);

ALTER TABLE canonical_auth_oauth_states
  ADD COLUMN previous_session_id text REFERENCES canonical_auth_sessions(session_id) ON DELETE SET NULL;

CREATE INDEX canonical_auth_oauth_states_previous_session_idx
  ON canonical_auth_oauth_states(previous_session_id)
  WHERE previous_session_id IS NOT NULL;

REVOKE ALL ON canonical_auth_rate_limits FROM PUBLIC;

COMMIT;
