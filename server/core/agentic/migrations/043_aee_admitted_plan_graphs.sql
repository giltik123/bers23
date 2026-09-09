BEGIN;

CREATE TABLE IF NOT EXISTS aee_admitted_plan_graphs (
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id text NOT NULL,
  graph_digest text NOT NULL,
  schema_version text NOT NULL,
  compiler_version text NOT NULL,
  capability_registry_version integer NOT NULL,
  capability_registry_digest text NOT NULL,
  intent_digest text NOT NULL,
  proposal_digest text NOT NULL,
  graph_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT aee_admitted_plan_graphs_pkey PRIMARY KEY (tenant_id, user_id, project_id, graph_digest),
  CONSTRAINT aee_admitted_plan_graphs_scope_check CHECK (
    btrim(tenant_id) <> '' AND octet_length(tenant_id) <= 256
    AND btrim(user_id) <> '' AND octet_length(user_id) <= 256
    AND btrim(project_id) <> '' AND octet_length(project_id) <= 256
  ),
  CONSTRAINT aee_admitted_plan_graphs_digest_check CHECK (graph_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT aee_admitted_plan_graphs_schema_check CHECK (schema_version = 'BERS_AEE_ADMITTED_PLAN_GRAPH_V1'),
  CONSTRAINT aee_admitted_plan_graphs_compiler_check CHECK (compiler_version = '1'),
  CONSTRAINT aee_admitted_plan_graphs_registry_version_check CHECK (capability_registry_version = 1),
  CONSTRAINT aee_admitted_plan_graphs_registry_digest_check CHECK (capability_registry_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT aee_admitted_plan_graphs_intent_digest_check CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT aee_admitted_plan_graphs_proposal_digest_check CHECK (proposal_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT aee_admitted_plan_graphs_json_object_check CHECK (jsonb_typeof(graph_json) = 'object'),
  CONSTRAINT aee_admitted_plan_graphs_json_binding_check CHECK (
    graph_json ->> 'digest' = graph_digest
    AND graph_json ->> 'schemaVersion' = schema_version
    AND graph_json ->> 'compilerVersion' = compiler_version
    AND graph_json ->> 'intentDigest' = intent_digest
    AND graph_json ->> 'proposalDigest' = proposal_digest
    AND graph_json -> 'capabilityRegistry' ->> 'digest' = capability_registry_digest
    AND graph_json -> 'capabilityRegistry' ->> 'version' = capability_registry_version::text
  )
);

CREATE INDEX IF NOT EXISTS aee_admitted_plan_graphs_scope_created_idx
  ON aee_admitted_plan_graphs (tenant_id, user_id, project_id, created_at DESC, graph_digest);

CREATE OR REPLACE FUNCTION aee_reject_admitted_plan_graph_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AEE admitted plan graphs are immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS aee_admitted_plan_graphs_immutable ON aee_admitted_plan_graphs;
CREATE TRIGGER aee_admitted_plan_graphs_immutable
BEFORE UPDATE OR DELETE ON aee_admitted_plan_graphs
FOR EACH ROW EXECUTE FUNCTION aee_reject_admitted_plan_graph_mutation();

COMMIT;
