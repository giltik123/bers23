import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_RESIZE_V1,
} from './AeeCapabilityRegistryV1.ts';
import { compileAeePlanV1 } from './AeePlanCompilerV1.ts';
import { AGENT_INTENT_V1_SCHEMA, agentIntentV1Digest, normalizeAgentIntentV1 } from './AgentIntentV1.ts';
import { PLAN_PROPOSAL_V1_SCHEMA } from './PlanProposalV1.ts';
import { PostgresAeeAdmittedPlanStore } from './PostgresAeeAdmittedPlanStore.ts';
import { checkAeeAdmittedPlanSchema, migrateAeeAdmittedPlanSchema } from './aeeAdmittedPlanSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for AE-4 admitted-plan acceptance');

const scope = Object.freeze({ tenantId: 'ae4-tenant', userId: 'ae4-user', projectId: 'ae4-project' });
const otherUser = Object.freeze({ ...scope, userId: 'ae4-user-b' });
const otherTenant = Object.freeze({ ...scope, tenantId: 'ae4-tenant-b' });
const otherProject = Object.freeze({ ...scope, projectId: 'ae4-project-b' });
const PROJECT_REVISION = 21;
const SOURCE_REF = 'ae4-source-artifact';

function compileGraph() {
  const rawIntent = {
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: 'ae4-postgres-test/1',
    goal: { capability: 'RESIZE', instruction: 'Rotate and resize current image.' },
    source: { projectId: scope.projectId, projectRevision: PROJECT_REVISION, sourceRef: SOURCE_REF },
    targets: [], mutable: [], preserve: [],
    constraints: { quality: 'BALANCED', styleTags: [] },
    execution: {
      policy: 'LOCAL_ONLY', cloudAllowed: false, maxNodes: 4, maxRetries: 1, maxReplans: 1,
      maxCandidates: 1, maxPaidCredits: 0, maxWallClockMs: 120_000, maxMemoryBytes: 64 * 1024 * 1024,
    },
    context: { modalities: ['TEXT'], uiReferences: [] }, ambiguities: [], evidence: [], confidence: 0.99,
  };
  const proposal = {
    schemaVersion: PLAN_PROPOSAL_V1_SCHEMA,
    plannerVersion: 'ae4-postgres-planner/1',
    intentDigest: agentIntentV1Digest(normalizeAgentIntentV1(rawIntent)),
    nodes: [
      {
        nodeId: 'rotate', capabilityId: AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1, capabilityVersion: 1,
        dependsOn: [], inputs: [{ name: 'source', source: { kind: 'INTENT_SOURCE' } }], parameters: { mode: 'ROTATE_90_CW' },
      },
      {
        nodeId: 'resize', capabilityId: AEE_CAPABILITY_RESIZE_V1, capabilityVersion: 1,
        dependsOn: ['rotate'], inputs: [{ name: 'source', source: { kind: 'NODE_OUTPUT', nodeId: 'rotate' } }], parameters: { width: 320, height: 240 },
      },
    ],
  };
  return compileAeePlanV1(rawIntent, proposal, {
    canonical: { projectId: scope.projectId, projectRevision: PROJECT_REVISION, sourceRef: SOURCE_REF },
    sourceArtifact: { role: 'ORIGINAL', width: 640, height: 480 },
  });
}

async function reset(pool: Pool) {
  await pool.query('DROP TABLE IF EXISTS aee_admitted_plan_graphs CASCADE');
  await migrateAeeAdmittedPlanSchema(pool);
  await checkAeeAdmittedPlanSchema(pool);
}

test('AE-4 admitted-plan store is immutable, scoped, idempotent and restart durable', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const admitted = compileGraph();
  try {
    await reset(pool);
    const store = new PostgresAeeAdmittedPlanStore(pool);
    const created = await store.put(scope, admitted);
    assert.equal(created.graph.digest, admitted.digest);
    assert.deepEqual(created.scope, scope);

    const replay = await store.put(scope, JSON.parse(JSON.stringify(admitted)));
    assert.equal(replay.graph.digest, admitted.digest);
    assert.equal(replay.createdAt, created.createdAt);

    assert.equal(await store.get(otherUser, admitted.digest), undefined);
    assert.equal(await store.get(otherTenant, admitted.digest), undefined);
    assert.equal(await store.get(otherProject, admitted.digest), undefined);
    await assert.rejects(
      () => store.put(otherProject, admitted),
      (error: any) => error?.code === 'aee_admitted_plan_cross_project',
    );

    await assert.rejects(
      () => pool.query('UPDATE aee_admitted_plan_graphs SET proposal_digest=$1 WHERE graph_digest=$2', ['0'.repeat(64), admitted.digest]),
      (error: any) => error?.code === '55000',
    );
    await assert.rejects(
      () => pool.query('DELETE FROM aee_admitted_plan_graphs WHERE graph_digest=$1', [admitted.digest]),
      (error: any) => error?.code === '55000',
    );
  } finally { await pool.end(); }

  const restarted = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const recovered = await new PostgresAeeAdmittedPlanStore(restarted).get(scope, admitted.digest);
    assert.equal(recovered?.graph.digest, admitted.digest);
    assert.deepEqual(recovered?.graph.nodes.map(node => node.nodeId), ['rotate', 'resize']);
  } finally { await restarted.end(); }
});

test('AE-4 durable load revalidates graph semantics after storage tampering', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const admitted = compileGraph();
  try {
    await reset(pool);
    const store = new PostgresAeeAdmittedPlanStore(pool);
    await store.put(scope, admitted);
    await pool.query('ALTER TABLE aee_admitted_plan_graphs DISABLE TRIGGER aee_admitted_plan_graphs_immutable');
    await pool.query(`UPDATE aee_admitted_plan_graphs
      SET graph_json=jsonb_set(graph_json,'{effectiveExecution,cloudAllowed}','true'::jsonb)
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND graph_digest=$4`,
    [scope.tenantId, scope.userId, scope.projectId, admitted.digest]);
    await pool.query('ALTER TABLE aee_admitted_plan_graphs ENABLE TRIGGER aee_admitted_plan_graphs_immutable');
    await assert.rejects(
      () => store.get(scope, admitted.digest),
      (error: any) => error?.code === 'aee_admitted_plan_execution_widened',
    );
  } finally { await pool.end(); }
});

test('AE-4 strict schema rejects permissive constraint, hidden authority column and disabled immutability trigger', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await reset(pool);
    await pool.query(`ALTER TABLE aee_admitted_plan_graphs
      DROP CONSTRAINT aee_admitted_plan_graphs_registry_version_check,
      ADD CONSTRAINT aee_admitted_plan_graphs_registry_version_check CHECK (capability_registry_version = 1 OR true)`);
    await assert.rejects(() => checkAeeAdmittedPlanSchema(pool), /incomplete or permissive/);

    await reset(pool);
    await pool.query('ALTER TABLE aee_admitted_plan_graphs ADD COLUMN provider_id text');
    await assert.rejects(() => checkAeeAdmittedPlanSchema(pool), /incomplete or permissive/);

    await reset(pool);
    await pool.query('ALTER TABLE aee_admitted_plan_graphs DISABLE TRIGGER aee_admitted_plan_graphs_immutable');
    await assert.rejects(() => checkAeeAdmittedPlanSchema(pool), /incomplete or permissive/);
  } finally { await pool.end(); }
});
