BEGIN;

CREATE TABLE canonical_project_body_anchor_sets (
  anchor_set_id uuid NOT NULL,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id uuid NOT NULL,
  project_image_storage_id uuid NOT NULL,
  project_image_sha256 character(64) NOT NULL,
  project_image_width integer NOT NULL,
  project_image_height integer NOT NULL,
  schema_id text NOT NULL,
  coordinate_space text NOT NULL,
  anchor_payload jsonb NOT NULL,
  anchor_payload_sha256 character(64) NOT NULL,
  producer_id text NOT NULL,
  producer_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT canonical_project_body_anchor_sets_pkey PRIMARY KEY (anchor_set_id),
  CONSTRAINT canonical_project_body_anchor_sets_owner_unique UNIQUE (anchor_set_id, project_id, tenant_id, user_id),
  CONSTRAINT canonical_project_body_anchor_sets_project_fk FOREIGN KEY (project_id) REFERENCES canonical_projects(project_id) ON DELETE RESTRICT,
  CONSTRAINT canonical_project_body_anchor_sets_image_fk FOREIGN KEY (project_image_storage_id) REFERENCES canonical_image_artifacts(storage_id) ON DELETE RESTRICT,
  CONSTRAINT canonical_project_body_anchor_sets_image_sha256_check CHECK (project_image_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canonical_project_body_anchor_sets_image_width_check CHECK (project_image_width > 0),
  CONSTRAINT canonical_project_body_anchor_sets_image_height_check CHECK (project_image_height > 0),
  CONSTRAINT canonical_project_body_anchor_sets_schema_id_check CHECK (schema_id = 'BERS_BODY_ANCHORS_V1'),
  CONSTRAINT canonical_project_body_anchor_sets_coordinate_space_check CHECK (coordinate_space = 'PROJECT_IMAGE_NORMALIZED'),
  CONSTRAINT canonical_project_body_anchor_sets_payload_object_check CHECK (jsonb_typeof(anchor_payload) = 'object'),
  CONSTRAINT canonical_project_body_anchor_sets_payload_sha256_check CHECK (anchor_payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canonical_project_body_anchor_sets_producer_id_check CHECK (char_length(producer_id) BETWEEN 1 AND 100 AND producer_id = btrim(producer_id) AND producer_id !~ '[[:cntrl:]]'),
  CONSTRAINT canonical_project_body_anchor_sets_producer_version_check CHECK (char_length(producer_version) BETWEEN 1 AND 100 AND producer_version = btrim(producer_version) AND producer_version !~ '[[:cntrl:]]')
);

CREATE INDEX canonical_project_body_anchor_sets_owner_project_idx
  ON canonical_project_body_anchor_sets (tenant_id, user_id, project_id, project_image_storage_id, created_at DESC, anchor_set_id);

CREATE OR REPLACE FUNCTION canonical_assert_project_body_anchor_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM canonical_projects p
    JOIN canonical_image_artifacts a
      ON a.storage_id = p.current_image_storage_id
     AND a.tenant_id = p.tenant_id
     AND a.user_id = p.user_id
     AND a.project_id = p.project_id::text
    WHERE p.project_id = NEW.project_id
      AND p.tenant_id = NEW.tenant_id
      AND p.user_id = NEW.user_id
      AND p.deleted_at IS NULL
      AND p.current_image_storage_id = NEW.project_image_storage_id
      AND p.width = NEW.project_image_width
      AND p.height = NEW.project_image_height
      AND a.width = NEW.project_image_width
      AND a.height = NEW.project_image_height
      AND a.encoding = 'PNG_RGBA8_LOSSLESS'
      AND a.content_type = 'image/png'
      AND a.revoked_at IS NULL
      AND a.deleted_at IS NULL
      AND ((a.role = 'ORIGINAL' AND a.lifecycle = 'IMMUTABLE') OR (a.role = 'COMPOSITE' AND a.lifecycle = 'FINAL'))
  ) THEN
    RAISE EXCEPTION 'project body anchor evidence does not match the current canonical Project image'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION canonical_project_body_anchor_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'canonical Project body anchor sets are immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER canonical_project_body_anchor_sets_insert_guard
  BEFORE INSERT ON canonical_project_body_anchor_sets
  FOR EACH ROW EXECUTE FUNCTION canonical_assert_project_body_anchor_insert();

CREATE TRIGGER canonical_project_body_anchor_sets_immutable_guard
  BEFORE UPDATE OR DELETE ON canonical_project_body_anchor_sets
  FOR EACH ROW EXECUTE FUNCTION canonical_project_body_anchor_immutable_guard();

COMMIT;
