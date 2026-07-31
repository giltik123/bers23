BEGIN;

CREATE TABLE credit_wallets (
  owner_id text PRIMARY KEY,
  total_credited bigint NOT NULL DEFAULT 0 CHECK (total_credited >= 0),
  lifetime_spent bigint NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved bigint NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= balance),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT wallet_reconciliation CHECK (balance = total_credited - lifetime_spent)
);

CREATE TABLE credit_reservations (
  id text PRIMARY KEY,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  owner_id text NOT NULL REFERENCES credit_wallets(owner_id),
  project_id text NOT NULL,
  operation_id text NOT NULL,
  operation_version integer NOT NULL CHECK (operation_version > 0),
  provider text NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  status text NOT NULL CHECK (status IN ('reserved', 'committed', 'released')),
  provider_state text NOT NULL DEFAULT 'pending' CHECK (provider_state IN ('pending', 'dispatched', 'success', 'failed', 'unknown')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  committed_at timestamptz,
  released_at timestamptz,
  lease_owner text,
  lease_until timestamptz,
  lease_version bigint NOT NULL DEFAULT 0 CHECK (lease_version >= 0),
  UNIQUE (owner_id, idempotency_key),
  CHECK (
    (status = 'reserved' AND committed_at IS NULL AND released_at IS NULL) OR
    (status = 'committed' AND committed_at IS NOT NULL AND released_at IS NULL) OR
    (status = 'released' AND released_at IS NOT NULL AND committed_at IS NULL)
  )
);

CREATE TABLE reservation_journal_sequences (
  reservation_id text PRIMARY KEY REFERENCES credit_reservations(id),
  next_sequence bigint NOT NULL CHECK (next_sequence > 0)
);

CREATE TABLE transaction_journal (
  id text PRIMARY KEY,
  reservation_id text NOT NULL REFERENCES credit_reservations(id),
  correlation_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  event text NOT NULL,
  source text NOT NULL CHECK (source IN ('reservation_service', 'transaction_service', 'recovery_service', 'manual_resolution')),
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (reservation_id, sequence)
);

CREATE INDEX credit_reservations_owner_idx
  ON credit_reservations (owner_id);
CREATE INDEX credit_reservations_status_idx
  ON credit_reservations (status);
CREATE INDEX credit_reservations_provider_state_idx
  ON credit_reservations (provider_state);
CREATE INDEX credit_reservations_lease_until_idx
  ON credit_reservations (lease_until)
  WHERE status = 'reserved';
CREATE INDEX credit_reservations_lease_owner_idx
  ON credit_reservations (lease_owner)
  WHERE lease_owner IS NOT NULL;
CREATE INDEX credit_reservations_recovery_idx
  ON credit_reservations (expires_at, lease_until)
  WHERE status = 'reserved';
CREATE INDEX transaction_journal_reservation_idx
  ON transaction_journal (reservation_id, sequence);

-- Internal financial tables are backend-only. Deployment must grant the owning
-- service role only the minimum SELECT/INSERT/UPDATE permissions it requires.
REVOKE ALL ON credit_wallets, credit_reservations,
  reservation_journal_sequences, transaction_journal FROM PUBLIC;

COMMIT;
