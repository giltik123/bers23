BEGIN;

-- Exact evidence keys are additive to the predecessor authorities. They let the
-- intermediate layer bind identity + owner + content digest with database-level
-- referential integrity instead of treating copied SHA strings as authority.
ALTER TABLE canonical_garment_representations
  ADD CONSTRAINT canonical_garment_representations_warp_evidence_unique
  UNIQUE (representation_id, garment_id, tenant_id, user_id, content_sha256);
ALTER TABLE canonical_project_body_anchor_sets
  ADD CONSTRAINT canonical_project_body_anchor_sets_warp_evidence_unique
  UNIQUE (anchor_set_id, project_id, tenant_id, user_id, anchor_payload_sha256);

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
  CONSTRAINT canonical_fashion_garment_warp_layers_view_evidence_fkey FOREIGN KEY (view_id,garment_id,tenant_id,user_id,view_content_sha256)
    REFERENCES canonical_garment_views (view_id,garment_id,tenant_id,user_id,content_sha256) ON DELETE RESTRICT,
  CONSTRAINT canonical_fashion_garment_warp_layers_representation_evidence_fkey FOREIGN KEY (representation_id,garment_id,tenant_id,user_id,representation_content_sha256)
    REFERENCES canonical_garment_representations (representation_id,garment_id,tenant_id,user_id,content_sha256) ON DELETE RESTRICT,
  CONSTRAINT canonical_fashion_garment_warp_layers_anchor_evidence_fkey FOREIGN KEY (anchor_set_id,project_id,tenant_id,user_id,anchor_payload_sha256)
    REFERENCES canonical_project_body_anchor_sets (anchor_set_id,project_id,tenant_id,user_id,anchor_payload_sha256) ON DELETE RESTRICT,
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
  -- FOR SHARE serializes admission with Project navigation, Garment archive/delete,
  -- view revocation and representation revocation. Historical layers remain immutable,
  -- but no new layer can be admitted from evidence that becomes stale concurrently.
  PERFORM 1
  FROM canonical_projects p
  JOIN canonical_image_artifacts a
    ON a.storage_id=p.current_image_storage_id
   AND a.tenant_id=p.tenant_id AND a.user_id=p.user_id AND a.project_id=p.project_id::text
  JOIN canonical_garments g
    ON g.garment_id=NEW.garment_id AND g.tenant_id=NEW.tenant_id AND g.user_id=NEW.user_id
  JOIN canonical_garment_views v
    ON v.view_id=NEW.view_id AND v.garment_id=g.garment_id AND v.tenant_id=g.tenant_id AND v.user_id=g.user_id
  JOIN canonical_garment_representations r
    ON r.representation_id=NEW.representation_id AND r.garment_id=g.garment_id AND r.tenant_id=g.tenant_id AND r.user_id=g.user_id
  JOIN canonical_project_body_anchor_sets b
    ON b.anchor_set_id=NEW.anchor_set_id AND b.project_id=p.project_id AND b.tenant_id=p.tenant_id AND b.user_id=p.user_id
  WHERE p.project_id=NEW.project_id AND p.tenant_id=NEW.tenant_id AND p.user_id=NEW.user_id
    AND p.deleted_at IS NULL AND p.current_image_storage_id=NEW.project_image_storage_id
    AND p.width=NEW.width AND p.height=NEW.height
    AND a.width=NEW.width AND a.height=NEW.height
    AND a.encoding='PNG_RGBA8_LOSSLESS' AND a.content_type='image/png'
    AND a.revoked_at IS NULL AND a.deleted_at IS NULL
    AND ((a.role='ORIGINAL' AND a.lifecycle='IMMUTABLE') OR (a.role='COMPOSITE' AND a.lifecycle='FINAL'))
    AND g.deleted_at IS NULL AND g.status='ACTIVE'
    AND v.revoked_at IS NULL AND v.deleted_at IS NULL AND v.content_sha256=NEW.view_content_sha256
    AND r.admission_state='ADMITTED' AND r.revoked_at IS NULL
    AND r.tier='PARAMETRIC' AND r.format='BERS_PARAMETRIC_V1'
    AND r.basis_view_id=NEW.view_id AND r.content_sha256=NEW.representation_content_sha256
    AND b.project_image_storage_id=NEW.project_image_storage_id
    AND b.project_image_sha256=NEW.project_image_sha256
    AND b.project_image_width=NEW.width AND b.project_image_height=NEW.height
    AND b.anchor_payload_sha256=NEW.anchor_payload_sha256
  FOR SHARE OF p,a,g,v,r,b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'garment warp layer evidence is stale, revoked or outside the canonical Fashion contract'
      USING ERRCODE='23514';
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
