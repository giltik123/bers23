import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import { createProductionCore } from '../server/core/composition/createProductionCore.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { createNodeHttpAdapter } from '../server/core/http/nodeHttpAdapter.ts';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: this suite must use real PostgreSQL');

const jwtSecret = 'vertical-jwt-secret';
const artifactSecret = 'vertical-artifact-secret';
const tenantId = 'vertical-tenant';
const projectId = 'vertical-project';
const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'deterministic-fixture',
  falBaseUrl: 'https://provider.vertical.test', jwtSecret, jwtIssuer: 'vertical-test', jwtAudience: 'vertical-core',
  artifactSigningSecret: artifactSecret, trustedAssetHosts: Object.freeze(['assets.vertical.test']), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1, bodyLimitBytes: 64_000,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

type ProviderMode = 'success' | 'failure' | 'unknown';
type DatabaseState = { reservations: Array<Record<string, unknown>>; journal: Array<Record<string, unknown>>; wallet: Record<string, unknown> };

function deterministicProvider() {
  let mode: ProviderMode = 'success';
  const calls: Array<{ prompt: string; metadata?: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://assets.vertical.test/output/')) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });
    }
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body)) as { prompt: string };
    calls.push({ prompt: body.prompt });
    if (mode === 'unknown') throw new DOMException('Accepted request timed out', 'AbortError');
    if (mode === 'failure') return new Response(JSON.stringify({ message: 'deterministic rejection' }), { status: 422, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ image: { url: `https://assets.vertical.test/output/${calls.length}.png` } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetcher, setMode(value: ProviderMode) { mode = value; }, count: () => calls.length, prompts: () => calls.map(call => call.prompt) };
}

function token(userId: string, valid = true): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: userId, tenantId, iss: config.jwtIssuer, aud: config.jwtAudience, exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = createHmac('sha256', valid ? jwtSecret : 'wrong-secret').update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function artifact(userId: string, ownerProject = projectId): string {
  const payload = Buffer.from(JSON.stringify({ id: `input-${userId}`, url: 'https://assets.vertical.test/input.png', tenantId, userId, projectId: ownerProject, exp: Date.now() + 600_000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', artifactSecret).update(payload).digest('base64url')}`;
}

async function start(pool: Pool, provider: ReturnType<typeof deterministicProvider>) {
  const production = await createProductionCore(config, { fetcher: provider.fetcher });
  const server = createServer(createNodeHttpAdapter({ core: production.core, auth: production.auth, config, ready: async () => true, accepting: () => true }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address === 'object');
  return { production, server, url: `http://127.0.0.1:${address.port}`, stop: async () => { await closeServer(server); await production.close(); } };
}

async function closeServer(server: Server) { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
async function wallet(pool: Pool, userId: string, balance = 20) { await pool.query('INSERT INTO credit_wallets (owner_id,total_credited,balance) VALUES ($1,$2,$2)', [userId, balance]); }
async function state(pool: Pool, userId: string): Promise<DatabaseState> {
  const reservations = await pool.query('SELECT * FROM credit_reservations WHERE owner_id=$1 ORDER BY created_at,id', [userId]);
  const journal = await pool.query('SELECT j.* FROM transaction_journal j JOIN credit_reservations r ON r.id=j.reservation_id WHERE r.owner_id=$1 ORDER BY j.occurred_at,j.sequence', [userId]);
  const walletResult = await pool.query('SELECT * FROM credit_wallets WHERE owner_id=$1', [userId]);
  return { reservations: reservations.rows, journal: journal.rows, wallet: walletResult.rows[0] ?? {} };
}
async function execute(url: string, userId: string, clientRequestId: string, options: { auth?: string; artifactId?: string; correlationId?: string } = {}) {
  const correlationId = options.correlationId ?? `correlation-${clientRequestId}`;
  const response = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { authorization: `Bearer ${options.auth ?? token(userId)}`, 'content-type': 'application/json', 'x-correlation-id': correlationId }, body: JSON.stringify({ projectId, instruction: clientRequestId, inputArtifactId: options.artifactId ?? artifact(userId), clientRequestId }) });
  return { response, body: await response.json() as Record<string, unknown>, correlationId };
}
function events(value: DatabaseState) { return value.journal.map(row => row.event); }

function stackLocation(error: Error): string | undefined {
  return error.stack?.split('\n').slice(1).map(line => line.trim()).find(Boolean);
}

function failureStage(value: DatabaseState, providerCalls: number): string {
  if (value.reservations.length === 0) return 'before or inside reservation';
  if (providerCalls === 0) return 'after reservation and before provider dispatch';
  if (events(value).includes('provider_succeeded') && !value.reservations.some(row => row.status === 'committed')) return 'transaction journal or commit';
  if (value.reservations.some(row => row.status === 'reserved')) return 'provider, verification, or commit path';
  if (value.reservations.some(row => row.status === 'committed')) return 'after commit';
  return 'undetermined; inspect reservation statuses and journal events';
}

async function throwUnexpectedSuccessDiagnostic(
  runtime: Awaited<ReturnType<typeof start>>,
  provider: ReturnType<typeof deterministicProvider>,
  pool: Pool,
  successUser: string,
  successArtifact: string,
  success: Awaited<ReturnType<typeof execute>>,
): Promise<void> {
  const providerCalls = provider.count();
  try {
    await runtime.production.core.service.execute(
      { projectId, instruction: 'success-1', inputArtifactId: successArtifact, clientRequestId: 'success-1' },
      { tenantId, userId: successUser },
      success.correlationId,
    );
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught));
    const technical = caught && typeof caught === 'object' ? caught as { code?: unknown; status?: unknown } : {};
    const successState = await state(pool, successUser);
    const providerCallsAfterDiagnostic = provider.count();
    const diagnostic = {
      originalError: {
        name: error.name,
        message: error.message,
        code: technical.code,
        status: technical.status,
        stackLocation: stackLocation(error),
      },
      http: { status: success.response.status, publicBody: success.body },
      providerCallCount: providerCallsAfterDiagnostic,
      providerCallCountBeforeDiagnostic: providerCalls,
      reservationCount: successState.reservations.length,
      reservationStatuses: successState.reservations.map(row => row.status),
      journalEvents: events(successState),
      wallet: { balance: successState.wallet.balance, reserved: successState.wallet.reserved },
      failureStage: failureStage(successState, providerCallsAfterDiagnostic),
    };
    assert.equal(providerCallsAfterDiagnostic, providerCalls, `diagnostic replay must reuse the inflight execution:\n${JSON.stringify(diagnostic, null, 2)}`);
    throw new Error(`Unexpected first-success HTTP response; original service failure:\n${JSON.stringify(diagnostic, null, 2)}`, { cause: error });
  }
  assert.fail(`Unexpected first-success HTTP ${success.response.status}; inflight service execution resolved instead of reproducing the failure`);
}

test('real Core HTTP server proves PostgreSQL financial lifecycle and safety invariants', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'core-vertical-fixture' });
  await migrateTransactionSchema(pool);
  await pool.query('TRUNCATE transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => { await pool.query('TRUNCATE transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE'); await pool.end(); });
  const provider = deterministicProvider();
  let runtime = await start(pool, provider);
  t.after(async () => { if (runtime) await runtime.stop(); });

  const successUser = 'vertical-success'; await wallet(pool, successUser);
  const successArtifact = artifact(successUser);
  const success = await execute(runtime.url, successUser, 'success-1', { correlationId: 'http-success-correlation', artifactId: successArtifact });
  if (success.response.status !== 200) await throwUnexpectedSuccessDiagnostic(runtime, provider, pool, successUser, successArtifact, success);
  assert.equal(success.response.status, 200); assert.equal(success.body.status, 'SUCCESS'); assert.equal(success.body.correlationId, success.correlationId);
  const successState = await state(pool, successUser);
  assert.equal(successState.reservations.length, 1); assert.equal(successState.reservations[0].status, 'committed');
  assert.deepEqual(events(successState), ['reservation_created', 'provider_dispatched', 'provider_succeeded', 'reservation_committed']);
  assert.equal(successState.reservations[0].correlation_id, success.body.executionId);
  assert.equal(successState.reservations[0].operation_id, `creative.execution.${success.body.executionId}`);
  assert.equal(successState.journal.every(row => row.correlation_id === success.body.executionId), true);
  assert.equal(provider.prompts().at(-1), 'success-1');

  provider.setMode('failure'); const failedUser = 'vertical-failed'; await wallet(pool, failedUser, 10); const beforeFailedCalls = provider.count();
  const failed = await execute(runtime.url, failedUser, 'failure-1'); assert.equal(failed.response.status, 200); assert.equal(failed.body.status, 'FAILED'); assert.equal(provider.count() - beforeFailedCalls, 1);
  const failedState = await state(pool, failedUser); assert.equal(failedState.reservations.length, 1); assert.equal(failedState.reservations[0].status, 'released'); assert.equal(failedState.wallet.balance, '10'); assert.equal(failedState.wallet.reserved, '0');
  assert.deepEqual(events(failedState), ['reservation_created', 'provider_dispatched', 'provider_failed', 'reservation_released']);

  provider.setMode('unknown'); const unknownUser = 'vertical-unknown'; await wallet(pool, unknownUser, 10); const beforeUnknownCalls = provider.count();
  const unknown = await execute(runtime.url, unknownUser, 'unknown-1'); assert.equal(unknown.response.status, 202); assert.equal(unknown.body.status, 'UNKNOWN'); assert.equal(provider.count() - beforeUnknownCalls, 1);
  const unknownState = await state(pool, unknownUser); assert.equal(unknownState.reservations[0].status, 'reserved'); assert.equal(unknownState.wallet.reserved, '1');
  assert.deepEqual(events(unknownState), ['reservation_created', 'provider_dispatched', 'recovery_deferred']);
  await runtime.stop();
  runtime = await start(pool, provider);
  const afterRestart = await state(pool, unknownUser); assert.equal(afterRestart.reservations[0].status, 'reserved'); assert.equal(afterRestart.wallet.reserved, '1'); assert.deepEqual(events(afterRestart), events(unknownState));

  provider.setMode('success'); const duplicateUser = 'vertical-duplicate'; await wallet(pool, duplicateUser); const beforeDuplicateCalls = provider.count();
  const duplicates = await Promise.all([execute(runtime.url, duplicateUser, 'duplicate-1'), execute(runtime.url, duplicateUser, 'duplicate-1')]);
  assert.deepEqual(duplicates.map(item => item.response.status), [200, 200]); assert.equal(provider.count() - beforeDuplicateCalls, 1);
  assert.equal(duplicates[0].body.executionId, duplicates[1].body.executionId);
  const duplicateState = await state(pool, duplicateUser); assert.equal(duplicateState.reservations.length, 1); assert.equal(events(duplicateState).filter(event => event === 'reservation_created').length, 1);

  const distinctUser = 'vertical-distinct'; await wallet(pool, distinctUser); const beforeDistinctCalls = provider.count();
  await Promise.all([execute(runtime.url, distinctUser, 'distinct-1'), execute(runtime.url, distinctUser, 'distinct-2')]);
  const distinctState = await state(pool, distinctUser); assert.equal(provider.count() - beforeDistinctCalls, 2); assert.equal(distinctState.reservations.length, 2); assert.equal(new Set(distinctState.reservations.map(row => row.idempotency_key)).size, 2);

  const unauthenticatedUser = 'vertical-unauthenticated'; await wallet(pool, unauthenticatedUser); const beforeAuthCalls = provider.count();
  const unauthenticated = await execute(runtime.url, unauthenticatedUser, 'auth-1', { auth: token(unauthenticatedUser, false) }); assert.equal(unauthenticated.response.status, 401); assert.equal(provider.count(), beforeAuthCalls); assert.equal((await state(pool, unauthenticatedUser)).reservations.length, 0);

  const artifactUser = 'vertical-artifact'; await wallet(pool, artifactUser); const beforeArtifactCalls = provider.count();
  const deniedArtifact = await execute(runtime.url, artifactUser, 'artifact-1', { artifactId: artifact('somebody-else') }); assert.equal(deniedArtifact.response.status, 403); assert.equal(provider.count(), beforeArtifactCalls); assert.equal((await state(pool, artifactUser)).reservations.length, 0);

  const budgetUser = 'vertical-budget'; await wallet(pool, budgetUser, 0); const beforeBudgetCalls = provider.count();
  const deniedBudget = await execute(runtime.url, budgetUser, 'budget-1'); assert.equal(deniedBudget.response.status, 403); assert.equal(provider.count(), beforeBudgetCalls); assert.equal((await state(pool, budgetUser)).reservations.length, 0);

  const rollbackUser = 'vertical-rollback'; await wallet(pool, rollbackUser); const beforeRollbackCalls = provider.count();
  await pool.query("CREATE FUNCTION vertical_force_journal_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced vertical rollback'; END $$");
  await pool.query('CREATE TRIGGER vertical_force_journal_failure BEFORE INSERT ON transaction_journal FOR EACH ROW EXECUTE FUNCTION vertical_force_journal_failure()');
  try { const rolledBack = await execute(runtime.url, rollbackUser, 'rollback-1'); assert.equal(rolledBack.response.status, 500); }
  finally { await pool.query('DROP TRIGGER vertical_force_journal_failure ON transaction_journal'); await pool.query('DROP FUNCTION vertical_force_journal_failure()'); }
  const rollbackState = await state(pool, rollbackUser); assert.equal(provider.count(), beforeRollbackCalls); assert.equal(rollbackState.reservations.length, 0); assert.equal(rollbackState.wallet.reserved, '0'); assert.equal(rollbackState.wallet.balance, '20');
});
