BEGIN;

CREATE TABLE IF NOT EXISTS canonical_automation_definitions (
  automation_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  name text NOT NULL,
  trigger text NOT NULL DEFAULT 'MANUAL',
  plan_kind text NOT NULL,
  orthogonal_mode text NOT NULL,
  target_width integer NOT NULL,
  target_height integer NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT canonical_automation_definitions_owner_check CHECK (
    btrim(tenant_id) <> '' AND octet_length(tenant_id) <= 256
    AND btrim(user_id) <> '' AND octet_length(user_id) <= 256
  ),
  CONSTRAINT canonical_automation_definitions_name_check CHECK (
    btrim(name) <> '' AND char_length(name) <= 120
  ),
  CONSTRAINT canonical_automation_definitions_trigger_check CHECK (trigger = 'MANUAL'),
  CONSTRAINT canonical_automation_definitions_plan_kind_check CHECK (plan_kind = 'BOUNDED_DETERMINISTIC_IMAGE_V1'),
  CONSTRAINT canonical_automation_definitions_orthogonal_mode_check CHECK (
    orthogonal_mode IN ('FLIP_HORIZONTAL','FLIP_VERTICAL','ROTATE_90_CW','ROTATE_180','ROTATE_270_CW')
  ),
  CONSTRAINT canonical_automation_definitions_geometry_check CHECK (
    target_width BETWEEN 1 AND 16384
    AND target_height BETWEEN 1 AND 16384
    AND target_width::bigint * target_height::bigint <= 268435456
  ),
  CONSTRAINT canonical_automation_definitions_status_check CHECK (status IN ('ACTIVE','ARCHIVED')),
  CONSTRAINT canonical_automation_definitions_revision_check CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS canonical_automation_definitions_scope_updated_idx
  ON canonical_automation_definitions (tenant_id, user_id, status, updated_at DESC, automation_id);

COMMIT;
