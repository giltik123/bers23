BEGIN;

CREATE TABLE financial_entitlement_accounts (
  owner_id text PRIMARY KEY REFERENCES credit_wallets(owner_id) ON DELETE RESTRICT,
  tenant_id text NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 256),
  plan_id text NOT NULL CHECK (plan_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  state text NOT NULL CHECK (state IN ('FREE','TRIAL','ACTIVE','GRACE','PAST_DUE','CANCELLED')),
  billing_interval text CHECK (billing_interval IS NULL OR billing_interval IN ('MONTHLY','YEARLY','CUSTOM')),
  source text NOT NULL CHECK (source IN ('SERVER_POLICY','VERIFIED_PROVIDER','MANUAL_RESOLUTION')),
  entitlement_revision bigint NOT NULL DEFAULT 1 CHECK (entitlement_revision > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  trial_consumed_at timestamptz,
  provider_customer_ref text,
  provider_subscription_ref text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (provider_customer_ref IS NULL OR length(provider_customer_ref) BETWEEN 1 AND 512),
  CHECK (provider_subscription_ref IS NULL OR length(provider_subscription_ref) BETWEEN 1 AND 512)
);

CREATE TABLE credit_grants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 256),
  owner_id text NOT NULL REFERENCES credit_wallets(owner_id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 256),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  grant_kind text NOT NULL CHECK (grant_kind IN ('WELCOME','TRIAL','PURCHASE','ADJUSTMENT')),
  source text NOT NULL CHECK (source IN ('SERVER_POLICY','VERIFIED_PROVIDER','MANUAL_RESOLUTION')),
  amount bigint NOT NULL CHECK (amount > 0),
  provider_event_id text,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, owner_id, idempotency_key),
  CHECK (provider_event_id IS NULL OR length(provider_event_id) BETWEEN 1 AND 512),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX credit_grants_provider_event_unique
  ON credit_grants (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX credit_grants_owner_time_idx
  ON credit_grants (tenant_id, owner_id, occurred_at DESC, id);

CREATE INDEX financial_entitlement_accounts_state_idx
  ON financial_entitlement_accounts (tenant_id, state, updated_at DESC);

-- Financial state is backend-only. Browser clients may observe only through
-- authenticated, scope-bound Core projections and never receive table access.
REVOKE ALL ON financial_entitlement_accounts, credit_grants FROM PUBLIC;

COMMIT;
