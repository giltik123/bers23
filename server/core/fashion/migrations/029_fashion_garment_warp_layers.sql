BEGIN;

CREATE TABLE canonical_fashion_garment_warp_layers (
  layer_id uuid NOT NULL,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id uuid NOT NULL,
  execution_id text NOT NULL,
  ticket_id text NOT NULL,
  project_image_storage_id uuid NOT NULL,
  project_image_sha256 character(64) NOT NULL,
  garment_id uuid NOT NULL,
  view_id uuid NOT NULL,
  view_content_sha256 character(64) NOT NULL,
  representation_id uuid NOT NULL,
  representation_content_sha256 character(64) NOT NULL,
  anchor_set_id uuid NOT NULL,
  anchor_payload_sha256 character(64) NOT NULL,
  destination_mesh_sha256 character(64) NOT NULL,
  tool_id text NOT NULL,
  tool_version text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  encoding text NOT NULL,
  content_sha256 character(64) NOT NULL,
  rgba_bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT canonical_fashion_garment_warp_layers_pkey PRIMARY KEY (layer_id),
  CONSTRAINT canonical_fashion_garment_warp_layers_execution_unique UNIQUE (tenant_id,user_id,project_id,execution_id),
  CONSTRAINT canonical_fashion_garment_warp_layers_garment_fkey FOREIGN KEY (garment_id,tenant_id,user_id)
    REFERENCES canonical_garments (garment_id,tenant_id,user_id) ON DELETE RESTRICT,
  CONSTRAINT canonical_fashion_garment_warp_layers_view_fkey FOREIGN KEY (view_id,garment_id,tenant_id,user_id,view_content_sha256)
    REFERENCES canonical_garment_views (view_id,garment_id,tenant_id,user_id,content_sha256) ON DELETE RESTRICT,
  CONSTRAINT canonical_fashion_garment_warp_layers_representation_fkey FOREIGN KEY (representation_id,garment_id,tenant_id,user_id)
    REFERENCES canonical_garment_representations (representation_id,garment_id,tenant_id,user_id) ON DELETE RESTRICT,
  CONSTRAINT canonical_fashion_garment_warp_layers_anchor_fkey FOREIGN KEY (anchor_set_id,project_id,tenant_id,user_id)
    REFERENCES canonical_project_body_anchor_sets (anchor_set_id,project_id,tenant_id,user_id) ON DELETE RESTRICT,
  CONSTRAINT canonical_fashion_garment_warp_layers_project_image_fkey FOREIGN KEY (project_image_storage_id)
    REFERENCES canonical_image_artifacts (storage_id) ON DELETE RESTRICT,
  CONSTRAINT canonical_fashion_garment_warp_layers_execution_check CHECK (char_length(execution_id) BETWEEN 1 AND 200 AND execution_id=btrim(execution_id) AND execution_id !~ '[[:cntrl:]]'),
  CONSTRAINT canonical_fashion_garment_warp_layers_ticket_check CHECK (char_length(ticket_id) BETWEEN 1 AND 200 AND ticket_id=btrim(ticket_id) AND ticket_id !~ '[[:cntrl:]]'),
  CONSTRAINT canonical_fashion_garment_warp_layers_hashes_check CHECK (
    project_image_sha256 ~ '^[0-9a-f]{64}$' AND view_content_sha256 ~ '^[0-9a-f]{64}$'
    AND representation_content_sha256 ~ '^[0-9a-f]{64}$' AND anchor_payload_sha256 ~ '^[0-9a-f]{64}$'
    AND destination_mesh_sha256 ~ '^[0-9a-f]{64}$' AND content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT canonical_fashion_garment_warp_layers_tool_check CHECK (tool_id='garment-mesh-warp' AND tool_version='1'),
  CONSTRAINT canonical_fashion_garment_warp_layers_geometry_check CHECK (width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096 AND (width::bigint*height::bigint)<=8388608),
  CONSTRAINT canonical_fashion_garment_warp_layers_payload_check CHECK (encoding='RGBA8_RAW_V1' AND octet_length(rgba_bytes)=width::bigint*height::bigint*4)
);

CREATE INDEX canonical_fashion_garment_warp_layers_owner_project_idx
  ON canonical_fashion_garment_warp_layers (tenant_id,user_id,project_id,created_at DESC,layer_id);

CREATE OR REPLACE FUNCTION canonical_assert_fashion_garment_warp_layer_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM canonical_projects p
    JOIN canonical_image_artifacts a
      ON a.storage_id=p.current_image_storage_id
     AND a.tenant_id=p.tenant_id AND a.user_id=p.user_id AND a.project_id=p.project_id::text
    WHERE p.project_id=NEW.project_id AND p.tenant_id=NEW.tenant_id AND p.user_id=NEW.user_id
      AND p.deleted_at IS NULL AND p.current_image_storage_id=NEW.project_image_storage_id
      AND p.width=NEW.width AND p.height=NEW.height
      AND a.width=NEW.width AND a.height=NEW.height
      AND a.encoding='PNG_RGBA8_LOSSLESS' AND a.content_type='image/png'
      AND a.revoked_at IS NULL AND a.deleted_at IS NULL
      AND ((a.role='ORIGINAL' AND a.lifecycle='IMMUTABLE') OR (a.role='COMPOSITE' AND a.lifecycle='FINAL'))
  ) THEN
    RAISE EXCEPTION 'garment warp layer does not match the current canonical Project image' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION canonical_fashion_garment_warp_layer_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'canonical Fashion garment warp layers are immutable' USING ERRCODE='55000';
END;
$$;

CREATE TRIGGER canonical_fashion_garment_warp_layers_insert_guard
  BEFORE INSERT ON canonical_fashion_garment_warp_layers
  FOR EACH ROW EXECUTE FUNCTION canonical_assert_fashion_garment_warp_layer_insert();
CREATE TRIGGER canonical_fashion_garment_warp_layers_immutable_guard
  BEFORE UPDATE OR DELETE ON canonical_fashion_garment_warp_layers
  FOR EACH ROW EXECUTE FUNCTION canonical_fashion_garment_warp_layer_immutable_guard();

COMMIT;
