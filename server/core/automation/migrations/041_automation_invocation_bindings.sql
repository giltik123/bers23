BEGIN;

CREATE TABLE IF NOT EXISTS canonical_automation_invocation_bindings (
  invocation_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  automation_id uuid NOT NULL,
  definition_revision bigint NOT NULL,
  plan_kind text NOT NULL,
  orthogonal_mode text NOT NULL,
  target_width integer NOT NULL,
  target_height integer NOT NULL,
  plan_digest char(64) NOT NULL,
  project_id uuid NOT NULL,
  source_image_storage_id uuid NOT NULL,
  source_role text NOT NULL,
  source_width integer NOT NULL,
  source_height integer NOT NULL,
  client_request_id text NOT NULL,
  downstream_client_request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT canonical_automation_invocation_bindings_owner_check CHECK (
    btrim(tenant_id) <> '' AND octet_length(tenant_id) <= 256
    AND btrim(user_id) <> '' AND octet_length(user_id) <= 256
  ),
  CONSTRAINT canonical_automation_invocation_bindings_revision_check CHECK (definition_revision >= 1),
  CONSTRAINT canonical_automation_invocation_bindings_plan_kind_check CHECK (
    plan_kind = 'BOUNDED_DETERMINISTIC_IMAGE_V1'
  ),
  CONSTRAINT canonical_automation_invocation_bindings_orthogonal_mode_check CHECK (
    orthogonal_mode IN ('FLIP_HORIZONTAL','FLIP_VERTICAL','ROTATE_90_CW','ROTATE_180','ROTATE_270_CW')
  ),
  CONSTRAINT canonical_automation_invocation_bindings_geometry_check CHECK (
    target_width BETWEEN 1 AND 16384
    AND target_height BETWEEN 1 AND 16384
    AND target_width::bigint * target_height::bigint <= 268435456
  ),
  CONSTRAINT canonical_automation_invocation_bindings_plan_digest_check CHECK (
    plan_digest ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT canonical_automation_invocation_bindings_source_check CHECK (
    source_role IN ('ORIGINAL','COMPOSITE')
    AND source_width BETWEEN 1 AND 16384
    AND source_height BETWEEN 1 AND 16384
    AND source_width::bigint * source_height::bigint <= 268435456
  ),
  CONSTRAINT canonical_automation_invocation_bindings_client_request_check CHECK (
    client_request_id ~ '^[A-Za-z0-9._:-]{1,160}$'
  ),
  CONSTRAINT canonical_automation_invocation_bindings_downstream_request_check CHECK (
    downstream_client_request_id ~ '^automation-agent-v1-[0-9a-f]{64}$'
  ),
  CONSTRAINT canonical_automation_invocation_bindings_intent_unique UNIQUE (
    tenant_id, user_id, automation_id, project_id, client_request_id
  ),
  CONSTRAINT canonical_automation_invocation_bindings_downstream_unique UNIQUE (
    tenant_id, user_id, downstream_client_request_id
  )
);

CREATE INDEX IF NOT EXISTS canonical_automation_invocation_bindings_scope_created_idx
  ON canonical_automation_invocation_bindings (tenant_id, user_id, automation_id, project_id, created_at DESC, invocation_id);

COMMIT;
