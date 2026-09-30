import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAutomationInvocationSchema } from './automationInvocationSchema.ts';

const TABLE = 'canonical_automation_invocation_bindings';
const columns = [
  ['invocation_id','uuid',null],
  ['tenant_id','text',null],
  ['user_id','text',null],
  ['automation_id','uuid',null],
  ['definition_revision','int8',null],
  ['plan_kind','text',null],
  ['orthogonal_mode','text',null],
  ['target_width','int4',null],
  ['target_height','int4',null],
  ['plan_digest','bpchar',64],
  ['project_id','uuid',null],
  ['source_image_storage_id','uuid',null],
  ['source_role','text',null],
  ['source_width','int4',null],
  ['source_height','int4',null],
  ['client_request_id','text',null],
  ['downstream_client_request_id','text',null],
  ['created_at','timestamptz',null],
].map(([column_name,udt_name,character_maximum_length]) => ({
  column_name,
  udt_name,
  is_nullable:'NO',
  column_default: column_name === 'created_at' ? 'CURRENT_TIMESTAMP' : null,
  character_maximum_length,
}));

const constraints = [
  ['canonical_automation_invocation_bindings_pkey','p','PRIMARY KEY (invocation_id)'],
  ['canonical_automation_invocation_bindings_owner_check','c',"CHECK (((btrim(tenant_id) <> ''::text) AND (octet_length(tenant_id) <= 256) AND (btrim(user_id) <> ''::text) AND (octet_length(user_id) <= 256)))"],
  ['canonical_automation_invocation_bindings_revision_check','c','CHECK ((definition_revision >= 1))'],
  ['canonical_automation_invocation_bindings_plan_kind_check','c',"CHECK ((plan_kind = 'BOUNDED_DETERMINISTIC_IMAGE_V1'::text))"],
  ['canonical_automation_invocation_bindings_orthogonal_mode_check','c',"CHECK ((orthogonal_mode = ANY (ARRAY['FLIP_HORIZONTAL'::text, 'FLIP_VERTICAL'::text, 'ROTATE_90_CW'::text, 'ROTATE_180'::text, 'ROTATE_270_CW'::text])))"],
  ['canonical_automation_invocation_bindings_geometry_check','c','CHECK ((((target_width >= 1) AND (target_width <= 16384)) AND ((target_height >= 1) AND (target_height <= 16384)) AND (((target_width)::bigint * (target_height)::bigint) <= 268435456)))'],
  ['canonical_automation_invocation_bindings_plan_digest_check','c',"CHECK ((plan_digest ~ '^[0-9a-f]{64}$'::text))"],
  ['canonical_automation_invocation_bindings_source_check','c',"CHECK (((source_role = ANY (ARRAY['ORIGINAL'::text, 'COMPOSITE'::text])) AND ((source_width >= 1) AND (source_width <= 16384)) AND ((source_height >= 1) AND (source_height <= 16384)) AND (((source_width)::bigint * (source_height)::bigint) <= 268435456)))"],
  ['canonical_automation_invocation_bindings_client_request_check','c',"CHECK ((client_request_id ~ '^[A-Za-z0-9._:-]{1,160}$'::text))"],
  ['canonical_automation_invocation_downstream_request_check','c',"CHECK ((downstream_client_request_id ~ '^automation-agent-v1-[0-9a-f]{64}$'::text))"],
  ['canonical_automation_invocation_bindings_intent_unique','u','UNIQUE (tenant_id, user_id, automation_id, project_id, client_request_id)'],
  ['canonical_automation_invocation_bindings_downstream_unique','u','UNIQUE (tenant_id, user_id, downstream_client_request_id)'],
].map(([conname,contype,definition]) => ({ conname,contype,convalidated:true,definition }));

const postgres18NotNullConstraints = columns.map(({column_name}) => ({
  conname:`pg18_${column_name}_not_null`,
  contype:'n',
  convalidated:true,
  definition:`NOT NULL ${column_name}`,
}));

function pool() {
  return {
    async query(sql) {
      const text = String(sql);
      if (text.includes("to_regclass('canonical_automation_invocation_bindings')::text")) {
        return { rows:[{table_name:TABLE}] };
      }
      if (text.includes('FROM information_schema.columns')) return { rows:columns };
      if (text.includes('FROM pg_constraint')) {
        const all = [...constraints, ...postgres18NotNullConstraints];
        return { rows:text.includes("contype <> 'n'") ? all.filter(row => row.contype !== 'n') : all };
      }
      if (text.includes('FROM pg_indexes')) {
        return { rows:[{
          indexname:'canonical_automation_invocation_bindings_scope_created_idx',
          indexdef:'CREATE INDEX canonical_automation_invocation_bindings_scope_created_idx ON public.canonical_automation_invocation_bindings USING btree (tenant_id, user_id, automation_id, project_id, created_at DESC, invocation_id)',
        }] };
      }
      if (text.includes('FROM pg_trigger')) {
        return { rows:[{
          tgname:'canonical_automation_invocation_bindings_immutable_guard',
          tgtype:27,
          tgenabled:'O',
          proname:'canonical_automation_invocation_binding_immutable_guard',
          prosrc:"BEGIN\n  RAISE EXCEPTION 'canonical Automation invocation binding is immutable'\n    USING ERRCODE = '55000';\nEND;",
        }] };
      }
      throw new Error(`unexpected schema query: ${text}`);
    },
  };
}

test('C3b schema checker accepts PostgreSQL 18 system NOT NULL pg_constraint rows without weakening semantic constraints', async () => {
  assert.equal(postgres18NotNullConstraints.length, 18);
  await checkAutomationInvocationSchema(pool());
});
