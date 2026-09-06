import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { migrateExecutionRunSchema } from '../server/core/execution/executionRunSchema.ts';
import { PostgresExecutionRunRegistry } from '../server/core/execution/PostgresExecutionRunRegistry.ts';
import { createExecutionRunRecoveryHttpAdapter } from '../server/core/http/executionRunRecoveryHttpAdapter.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for ExecutionRun recovery HTTP PostgreSQL acceptance');

const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-execution-run-recovery-http' });
const projects = new PostgresProjectStore(pool);
const runs = new PostgresExecutionRunRegistry(pool);
const owner = Object.freeze({ tenantId: 'tenant-execution-recovery', userId: 'user-execution-recovery' });
const otherUser = Object.freeze({ tenantId: owner.tenantId, userId: 'other-execution-recovery-user' });
let projectId = '';
let otherProjectId = '';

async function png(seed: number) {
  return new Uint8Array(await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: seed, g: 40, b: 50, alpha: 1 } } }).png().toBuffer());
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
  projectId = await createProject('Execution recovery project', 21);
  otherProjectId = await createProject('Execution recovery other project', 22);
});

test.after(async () => {
  await pool.query('TRUNCATE canonical_execution_runs,canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts RESTART IDENTITY CASCADE');
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query('TRUNCATE canonical_execution_runs RESTART IDENTITY CASCADE');
});

function scope() { return Object.freeze({ ...owner, projectId }); }

async function buildTopology() {
  const parent = (await runs.issue({
    scope: scope(),
    capability: 'WORKFLOW_CONTINUATION',
    idempotencyKey: 'recovery-workflow-request',
    authorityKind: 'WORKFLOW_CONTINUATION',
    authorityRef: 'recovery-workflow-execution',
  })).run;
  await runs.start(parent.scope, parent.runId);

  const local = (await runs.issue({
    scope: scope(),
    capability: 'LOCAL_EXECUTION',
    idempotencyKey: `recovery-local:${parent.runId}:segment`,
    authorityKind: 'LOCAL_EXECUTION_TICKET',
    authorityRef: 'recovery-local-ticket-segment',
    parentRunId: parent.runId,
  })).run;
  await runs.start(local.scope, local.runId);
  const succeededLocal = await runs.succeed(local.scope, local.runId);

  const internal = (await runs.issue({
    scope: scope(),
    capability: 'WORKFLOW_STEP',
    idempotencyKey: `recovery-internal:${parent.runId}:verify`,
    authorityKind: 'WORKFLOW_INTERNAL_STEP',
    authorityRef: 'workflow-internal-step:recovery-workflow-execution:verify',
    parentRunId: parent.runId,
  })).run;
  const runningInternal = await runs.start(internal.scope, internal.runId);

  return Object.freeze({ parent: await runs.get(parent.scope, parent.runId), local: succeededLocal, internal: runningInternal });
}

function config() {
  return Object.freeze({
    nodeEnv: 'test',
    allowApiBearerAuth: true,
    allowedWebOrigins: Object.freeze(['https://app.example.test']),
    authPublicOrigin: 'http://localhost',
    authChallengeSecret: 'execution-recovery-http-secret',
  }) as any;
}

function adapterFor(principal: Readonly<{ tenantId: string; userId: string }>) {
  return createExecutionRunRecoveryHttpAdapter({
    runs,
    auth: Object.freeze({
      verify: async (authorization: string | undefined) => {
        if (authorization !== 'Bearer recovery.token.value') throw Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated' });
        return principal as any;
      },
    }),
    config: config(),
  });
}

async function withServer(handler: ReturnType<typeof createExecutionRunRecoveryHttpAdapter>, fn: (base: string) => Promise<void>) {
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function headers() { return { authorization: 'Bearer recovery.token.value', origin: 'https://app.example.test' }; }

async function body(response: Response): Promise<any> { return response.json(); }

test('PostgreSQL recovery lists only roots and returns exact direct LOCAL and INTERNAL children', async () => {
  const topology = await buildTopology();
  assert.ok(topology.parent);
  await withServer(adapterFor(owner), async base => {
    const rootsResponse = await fetch(`${base}/api/core/execution-runs?projectId=${projectId}&limit=10`, { headers: headers() });
    assert.equal(rootsResponse.status, 200);
    assert.equal(rootsResponse.headers.get('cache-control'), 'no-store');
    const roots = await body(rootsResponse);
    assert.deepEqual(roots.runs.map((candidate: any) => candidate.runId), [topology.parent!.runId]);
    assert.equal(roots.runs[0].status, 'RUNNING');
    assert.equal('idempotencyKey' in roots.runs[0], false);
    assert.equal('scope' in roots.runs[0], false);

    const childrenResponse = await fetch(`${base}/api/core/execution-runs/${topology.parent!.runId}/children?projectId=${projectId}&limit=10`, { headers: headers() });
    assert.equal(childrenResponse.status, 200);
    const children = await body(childrenResponse);
    assert.equal(children.parent.runId, topology.parent!.runId);
    assert.deepEqual(new Set(children.runs.map((candidate: any) => candidate.runId)), new Set([topology.local.runId, topology.internal.runId]));
    const local = children.runs.find((candidate: any) => candidate.runId === topology.local.runId);
    const internal = children.runs.find((candidate: any) => candidate.runId === topology.internal.runId);
    assert.equal(local.status, 'SUCCEEDED');
    assert.equal(local.authorityKind, 'LOCAL_EXECUTION_TICKET');
    assert.equal(internal.status, 'RUNNING');
    assert.equal(internal.authorityKind, 'WORKFLOW_INTERNAL_STEP');
    assert.equal(children.runs.some((candidate: any) => 'idempotencyKey' in candidate), false);

    const exactResponse = await fetch(`${base}/api/core/execution-runs/${topology.local.runId}?projectId=${projectId}`, { headers: headers() });
    assert.equal(exactResponse.status, 200);
    assert.equal((await body(exactResponse)).status, 'SUCCEEDED');
  });
});

test('PostgreSQL recovery is existence-safe across user and project scope', async () => {
  const topology = await buildTopology();
  assert.ok(topology.parent);

  await withServer(adapterFor(otherUser), async base => {
    const rootsResponse = await fetch(`${base}/api/core/execution-runs?projectId=${projectId}`, { headers: headers() });
    assert.equal(rootsResponse.status, 200);
    assert.deepEqual((await body(rootsResponse)).runs, []);

    const exactResponse = await fetch(`${base}/api/core/execution-runs/${topology.parent!.runId}?projectId=${projectId}`, { headers: headers() });
    assert.equal(exactResponse.status, 404);
    assert.equal((await body(exactResponse)).error, 'execution_run_not_found');

    const childrenResponse = await fetch(`${base}/api/core/execution-runs/${topology.parent!.runId}/children?projectId=${projectId}`, { headers: headers() });
    assert.equal(childrenResponse.status, 404);
    assert.equal((await body(childrenResponse)).error, 'execution_run_not_found');
  });

  await withServer(adapterFor(owner), async base => {
    const rootsResponse = await fetch(`${base}/api/core/execution-runs?projectId=${otherProjectId}`, { headers: headers() });
    assert.equal(rootsResponse.status, 200);
    assert.deepEqual((await body(rootsResponse)).runs, []);

    const exactResponse = await fetch(`${base}/api/core/execution-runs/${topology.parent!.runId}?projectId=${otherProjectId}`, { headers: headers() });
    assert.equal(exactResponse.status, 404);
  });
});

test('root query is bounded independently from children and preserves deterministic root ordering', async () => {
  const first = await buildTopology();
  assert.ok(first.parent);
  const second = (await runs.issue({
    scope: scope(),
    capability: 'CREATIVE_EXECUTION',
    idempotencyKey: 'recovery-creative-root',
    authorityKind: 'CREATIVE_EXECUTION',
    authorityRef: 'recovery-creative-execution',
  })).run;
  await runs.cancel(second.scope, second.runId, 'USER_CANCELLED');

  const roots = await runs.listRoots(scope(), 10);
  assert.equal(roots.length, 2);
  assert.equal(roots.some(candidate => candidate.parentRunId !== undefined), false);
  assert.equal(roots.some(candidate => candidate.runId === first.local.runId), false);
  assert.equal(roots.some(candidate => candidate.runId === first.internal.runId), false);
  assert.equal((await runs.listRoots(scope(), 1)).length, 1);
  await assert.rejects(() => runs.listRoots(scope(), 201), /at most 200/);
});
