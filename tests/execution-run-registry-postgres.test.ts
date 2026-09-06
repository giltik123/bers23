import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { checkExecutionRunSchema, migrateExecutionRunSchema } from '../server/core/execution/executionRunSchema.ts';
import { PostgresExecutionRunRegistry } from '../server/core/execution/PostgresExecutionRunRegistry.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Execution Run Registry PostgreSQL acceptance');
const pool = new Pool({ connectionString: databaseUrl, max: 8, application_name: 'bers-execution-run-registry-staging' });
const projects = new PostgresProjectStore(pool);
const registry = new PostgresExecutionRunRegistry(pool);
const owner = Object.freeze({ tenantId: 'tenant-execution-registry', userId: 'user-execution-registry' });
let projectId = '';
let secondProjectId = '';

async function png(seed: number) {
  return new Uint8Array(await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: seed, g: 20, b: 30, alpha: 1 } } }).png().toBuffer());
}

async function createProject(name: string, seed: number) {
  const row = await projects.create(owner, name, await png(seed), { maxDimension: 64, maxPixels: 4096 });
  return String(row.project_id).toLowerCase();
}

test.before(async () => {
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await migrateExecutionRunSchema(pool);
  await pool.query('TRUNCATE canonical_execution_runs,canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts RESTART IDENTITY CASCADE');
  projectId = await createProject('Execution registry project', 10);
  secondProjectId = await createProject('Execution registry second project', 11);
  await checkExecutionRunSchema(pool);
});

test.after(async () => {
  await pool.query('TRUNCATE canonical_execution_runs,canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts RESTART IDENTITY CASCADE');
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query('TRUNCATE canonical_execution_runs RESTART IDENTITY CASCADE');
});

function localInput(overrides: Record<string, unknown> = {}) {
  return {
    scope: { ...owner, projectId },
    capability: 'LOCAL_EXECUTION' as const,
    idempotencyKey: 'local:resize:request-1',
    authorityKind: 'LOCAL_EXECUTION_TICKET' as const,
    authorityRef: 'ticket-local-1',
    ...overrides,
  };
}

function creativeInput(overrides: Record<string, unknown> = {}) {
  return {
    scope: { ...owner, projectId },
    capability: 'CREATIVE_EXECUTION' as const,
    idempotencyKey: 'creative:request-1',
    authorityKind: 'CREATIVE_EXECUTION' as const,
    authorityRef: 'creative-execution-1',
    ...overrides,
  };
}

function workflowInput(overrides: Record<string, unknown> = {}) {
  return {
    scope: { ...owner, projectId },
    capability: 'WORKFLOW_CONTINUATION' as const,
    idempotencyKey: 'workflow:request-1',
    authorityKind: 'WORKFLOW_CONTINUATION' as const,
    authorityRef: 'workflow-execution-1',
    ...overrides,
  };
}

async function issueRun(input: any) {
  return (await registry.issue(input)).run;
}

test('concurrent issue is idempotent, reports one creator, and one underlying authority cannot be rebound', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => registry.issue(localInput())));
  assert.equal(new Set(results.map(result => result.run.runId)).size, 1);
  assert.equal(results.filter(result => result.created).length, 1);
  assert.equal(results.filter(result => !result.created).length, 7);
  assert.equal(results[0].run.status, 'QUEUED');
  assert.equal(results[0].run.revision, 1);
  assert.equal((await registry.list({ ...owner, projectId })).length, 1);

  await assert.rejects(
    () => registry.issue(localInput({ authorityRef: 'ticket-local-conflict' })),
    (error: any) => error?.code === 'execution_run_idempotency_conflict',
  );
  await assert.rejects(
    () => registry.issue(localInput({ idempotencyKey: 'local:resize:request-2' })),
    (error: any) => error?.code === 'execution_run_authority_already_bound',
  );
  await assert.rejects(
    () => registry.issue(localInput({
      scope: { ...owner, projectId: secondProjectId },
      idempotencyKey: 'local:resize:other-project',
    })),
    (error: any) => error?.code === 'execution_run_authority_already_bound',
  );
});

test('exact idempotent replay is explicitly marked and remains recoverable after its Project is deleted', async () => {
  const issued = await registry.issue(localInput());
  assert.equal(issued.created, true);
  await pool.query('UPDATE canonical_projects SET deleted_at=CURRENT_TIMESTAMP WHERE project_id=$1', [projectId]);
  try {
    const replay = await registry.issue(localInput());
    assert.equal(replay.created, false);
    assert.equal(replay.run.runId, issued.run.runId);
    assert.equal(replay.run.revision, issued.run.revision);
    await assert.rejects(
      () => registry.issue(localInput({ idempotencyKey: 'local:new-after-delete', authorityRef: 'ticket-new-after-delete' })),
      (error: any) => error?.code === 'execution_run_project_unavailable',
    );
  } finally {
    await pool.query('UPDATE canonical_projects SET deleted_at=NULL WHERE project_id=$1', [projectId]);
  }
});

test('capability and authority kind cannot be mixed or pre-open Agent/Automation authority', async () => {
  await assert.rejects(
    () => registry.issue({ ...localInput(), authorityKind: 'CREATIVE_EXECUTION' as any }),
    /incompatible/,
  );
  await assert.rejects(
    () => registry.issue({ ...workflowInput(), authorityKind: 'CREATIVE_EXECUTION' as any }),
    /incompatible/,
  );
  await assert.rejects(
    () => registry.issue({ ...localInput(), capability: 'AGENT' as any }),
    /outside the accepted execution run enum/,
  );
  await assert.rejects(
    () => registry.issue({ ...localInput(), capability: 'AUTOMATION' as any }),
    /outside the accepted execution run enum/,
  );

  await assert.rejects(
    () => pool.query(`INSERT INTO canonical_execution_runs
      (run_id,tenant_id,user_id,project_id,capability,idempotency_key,authority_kind,authority_ref)
      VALUES ($1,$2,$3,$4,'LOCAL_EXECUTION',$5,'CREATIVE_EXECUTION',$6)`,
    [randomUUID(),owner.tenantId,owner.userId,projectId,'direct-mismatch','direct-mismatch-authority']),
  );
});

test('Project ownership and parent lineage are scope-bound', async () => {
  await assert.rejects(
    () => registry.issue(localInput({ scope: { tenantId: owner.tenantId, userId: 'other-user', projectId } })),
    (error: any) => error?.code === 'execution_run_project_unavailable',
  );
  const parent = await issueRun(creativeInput());
  await assert.rejects(
    () => registry.issue(localInput({
      scope: { ...owner, projectId: secondProjectId },
      idempotencyKey: 'local:child-other-project',
      authorityRef: 'ticket-child-other-project',
      parentRunId: parent.runId,
    })),
    (error: any) => error?.code === 'execution_run_parent_unavailable',
  );
  assert.equal(await registry.get({ tenantId: owner.tenantId, userId: 'other-user', projectId }, parent.runId), undefined);
});

test('lifecycle is monotonic, revisioned and terminal transitions are immutable', async () => {
  const queued = await issueRun(localInput());
  const running = await registry.start(queued.scope, queued.runId);
  assert.equal(running.status, 'RUNNING');
  assert.equal(running.revision, 2);
  assert.ok(running.startedAt);
  const runningReplay = await registry.start(queued.scope, queued.runId);
  assert.equal(runningReplay.revision, 2);

  const succeeded = await registry.succeed(queued.scope, queued.runId);
  assert.equal(succeeded.status, 'SUCCEEDED');
  assert.equal(succeeded.revision, 3);
  assert.ok(succeeded.finishedAt);
  assert.equal((await registry.succeed(queued.scope, queued.runId)).revision, 3);
  await assert.rejects(
    () => registry.fail(queued.scope, queued.runId, 'LATE_FAILURE'),
    (error: any) => error?.code === 'execution_run_transition_conflict',
  );

  const creative = await issueRun(creativeInput());
  const cancelled = await registry.cancel(creative.scope, creative.runId, 'USER_CANCELLED');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.revision, 2);
  assert.equal(cancelled.startedAt, undefined);
  assert.equal(cancelled.statusReasonCode, 'USER_CANCELLED');
  assert.equal((await registry.cancel(creative.scope, creative.runId, 'USER_CANCELLED')).revision, 2);
  await assert.rejects(
    () => registry.cancel(creative.scope, creative.runId, 'OTHER_REASON'),
    (error: any) => error?.code === 'execution_run_terminal_conflict',
  );

  const workflow = await issueRun(workflowInput());
  const workflowRunning = await registry.start(workflow.scope, workflow.runId);
  const unknown = await registry.markUnknown(workflowRunning.scope, workflowRunning.runId, 'LOCAL_COMPOSITE_RESULT_UNKNOWN');
  assert.equal(unknown.status, 'UNKNOWN');
  assert.equal(unknown.revision, 3);
  assert.equal(unknown.statusReasonCode, 'LOCAL_COMPOSITE_RESULT_UNKNOWN');
  assert.ok(unknown.startedAt);
  assert.ok(unknown.finishedAt);
  assert.equal((await registry.markUnknown(unknown.scope, unknown.runId, 'LOCAL_COMPOSITE_RESULT_UNKNOWN')).revision, 3);
  await assert.rejects(
    () => registry.markUnknown(unknown.scope, unknown.runId, 'OTHER_UNKNOWN'),
    (error: any) => error?.code === 'execution_run_terminal_conflict',
  );
  await assert.rejects(
    () => registry.succeed(unknown.scope, unknown.runId),
    (error: any) => error?.code === 'execution_run_transition_conflict',
  );
});

test('list and listChildren are scoped, bounded and isolate direct parent lineage', async () => {
  const parent = await issueRun(creativeInput());
  const firstChild = await issueRun(localInput({ parentRunId: parent.runId }));
  const secondChild = await issueRun(localInput({
    idempotencyKey: 'local:resize:request-2',
    authorityRef: 'ticket-local-2',
    parentRunId: parent.runId,
  }));
  const otherParent = await issueRun(workflowInput());
  const otherChild = await issueRun(localInput({
    idempotencyKey: 'local:resize:other-parent',
    authorityRef: 'ticket-local-other-parent',
    parentRunId: otherParent.runId,
  }));

  assert.equal(firstChild.parentRunId, parent.runId);
  assert.equal(secondChild.parentRunId, parent.runId);
  const listed = await registry.list(parent.scope, 10);
  assert.equal(listed.length, 5);
  assert.deepEqual(new Set(listed.map(run => run.runId)), new Set([parent.runId, firstChild.runId, secondChild.runId, otherParent.runId, otherChild.runId]));

  const directChildren = await registry.listChildren(parent.scope, parent.runId, 10);
  assert.deepEqual(directChildren.map(run => run.runId), [firstChild.runId, secondChild.runId]);
  assert.deepEqual((await registry.listChildren(parent.scope, parent.runId, 1)).map(run => run.runId), [firstChild.runId]);
  assert.deepEqual((await registry.listChildren(parent.scope, otherParent.runId, 10)).map(run => run.runId), [otherChild.runId]);
  assert.equal((await registry.listChildren({ ...owner, projectId: secondProjectId }, parent.runId, 10)).length, 0);
  assert.equal((await registry.list({ ...owner, projectId: secondProjectId })).length, 0);

  await assert.rejects(() => registry.listChildren(parent.scope, parent.runId, 0), /positive safe integer/);
  await assert.rejects(() => registry.listChildren(parent.scope, parent.runId, 201), /at most 200/);
});

test('schema check rejects arbitrary capability widening, not only known future capabilities', async () => {
  await pool.query('ALTER TABLE canonical_execution_runs DROP CONSTRAINT canonical_execution_runs_capability_check');
  await pool.query("ALTER TABLE canonical_execution_runs ADD CONSTRAINT canonical_execution_runs_capability_check CHECK (capability IN ('LOCAL_EXECUTION','CREATIVE_EXECUTION','WORKFLOW_CONTINUATION','OTHER_CAPABILITY'))");
  await assert.rejects(() => checkExecutionRunSchema(pool), /incomplete or permissive/);
  await pool.query('ALTER TABLE canonical_execution_runs DROP CONSTRAINT canonical_execution_runs_capability_check');
  await pool.query("ALTER TABLE canonical_execution_runs ADD CONSTRAINT canonical_execution_runs_capability_check CHECK (capability IN ('LOCAL_EXECUTION','CREATIVE_EXECUTION','WORKFLOW_CONTINUATION'))");
  await checkExecutionRunSchema(pool);
});

test('schema check rejects a scope-local authority uniqueness lookalike', async () => {
  await pool.query('ALTER TABLE canonical_execution_runs DROP CONSTRAINT canonical_execution_runs_authority_unique');
  await pool.query(`ALTER TABLE canonical_execution_runs ADD CONSTRAINT canonical_execution_runs_authority_unique
    UNIQUE (tenant_id,user_id,project_id,authority_kind,authority_ref)`);
  await assert.rejects(() => checkExecutionRunSchema(pool), /incomplete or permissive/);
  await pool.query('ALTER TABLE canonical_execution_runs DROP CONSTRAINT canonical_execution_runs_authority_unique');
  await pool.query('ALTER TABLE canonical_execution_runs ADD CONSTRAINT canonical_execution_runs_authority_unique UNIQUE (authority_kind,authority_ref)');
  await checkExecutionRunSchema(pool);
});

test('exact historical 034 schema upgrades forward to D1 and migration replay is idempotent', async () => {
  await pool.query('DROP TABLE canonical_execution_runs');
  const baseMigration = await readFile(resolve(process.cwd(), 'server/core/execution/migrations/034_execution_run_registry.sql'), 'utf8');
  await pool.query(baseMigration);
  await assert.rejects(() => checkExecutionRunSchema(pool), /apply migrations 034 and 036/);
  await migrateExecutionRunSchema(pool);
  await checkExecutionRunSchema(pool);
  await migrateExecutionRunSchema(pool);
  await checkExecutionRunSchema(pool);

  const issued = await registry.issue(workflowInput({ idempotencyKey: 'workflow:upgrade-proof', authorityRef: 'workflow-upgrade-proof' }));
  assert.equal(issued.created, true);
  assert.equal(issued.run.capability, 'WORKFLOW_CONTINUATION');
  assert.equal(issued.run.authorityKind, 'WORKFLOW_CONTINUATION');
});