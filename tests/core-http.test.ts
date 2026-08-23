import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { once } from 'node:events';
import { createCreativeCore, type CreativeCoreDependencies } from '../server/core/composition/createCreativeCore.ts';
import { createCreativeHttpHandler } from '../server/core/http/creativeHttpHandler.ts';
import { nodeHttpAdapter } from '../server/core/http/nodeHttpAdapter.ts';
import { readProviderEnvironment } from '../server/core/composition/providerEnvironment.ts';

const scope = { tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' };
const artifact = { id: 'artifact-a', kind: 'image', value: 'asset://a', producerOperationId: 'upload', scope, state: 'AVAILABLE' as const };
function fixture() {
  let providerCalls = 0; let billingMutations = 0;
  const dependencies: CreativeCoreDependencies = {
    auth: { verify: async token => token === 'valid-a' ? { tenantId: 'tenant-a', userId: 'user-a' } : token === 'valid-b' ? { tenantId: 'tenant-b', userId: 'user-b' } : undefined },
    artifacts: {
      projectBelongsTo: async (id, identity) => id === 'project-a' && identity.userId === 'user-a',
      resolveArtifact: async (id, requestScope) => id === artifact.id && requestScope === requestScope && requestScope.userId === scope.userId ? artifact : undefined,
      resolveLegacyUrl: async (url, requestScope) => url === 'https://assets.example.test/a.png' && requestScope.userId === scope.userId ? artifact : undefined,
    },
    telemetry: { record: () => undefined }, trustedAssetHosts: ['assets.example.test'], maxCredits: 10,
    platform: {
      decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
      planning: { plan: async request => ({ requestId: request.id, operations: [{ id: 'edit', type: 'image-edit', requiredArtifacts: ['artifact-a'], produces: ['result'], providerId: 'fal', cost: { credits: 1 } }] }) },
      targetSelector: { select: () => 'CLOUD' }, capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'synthetic-http-test-runtime' }) }, securityGate: { authorize: request => request.scope.userId === 'user-a' }, recovery: { decide: () => 'MARK_UNKNOWN' },
      providers: { isAvailable: () => true, fallback: () => undefined },
      runtime: { execute: async request => { providerCalls++; return { artifacts: [{ id: 'result', kind: 'image', value: 'asset://result' }] }; } },
      verifier: { verify: async operation => ({ stepId: operation.id, valid: true, checks: ['artifact'], errors: [] }) },
      billing: { reserve: async () => { billingMutations++; return { reservationId: 'reservation', status: 'RESERVED' }; }, commit: async id => { billingMutations++; return { reservationId: id, status: 'COMMITTED' }; }, release: async id => { billingMutations++; return { reservationId: id, status: 'RELEASED' }; } },
      now: (() => { let value = Date.now(); return () => ++value; })(), id: (() => { let value = 0; return () => `id-${++value}`; })(),
    },
  };
  return { dependencies, counters: () => ({ providerCalls, billingMutations }) };
}
async function serverFor(dependencies: CreativeCoreDependencies) {
  const core = createCreativeCore(dependencies); const server = createServer(nodeHttpAdapter(createCreativeHttpHandler(core))); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address === 'object'); return { core, server, url: `http://127.0.0.1:${address.port}` };
}
const executeBody = { clientRequestId: 'request-00000001', projectId: 'project-a', artifactId: 'artifact-a', intent: 'edit', userId: 'user-b', tenantId: 'tenant-b', budget: { credits: 1 } };

test('real HTTP boundary rejects unauthenticated calls before provider and billing', async t => { const f = fixture(); const { server, url } = await serverFor(f.dependencies); t.after(() => server.close()); const response = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(executeBody) }); assert.equal(response.status, 401); assert.deepEqual(f.counters(), { providerCalls: 0, billingMutations: 0 }); });

test('HTTP execute uses authenticated identity through canonical facade and minimizes result', async t => { const f = fixture(); const { core, server, url } = await serverFor(f.dependencies); t.after(() => server.close()); const response = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { authorization: 'Bearer valid-a', 'content-type': 'application/json' }, body: JSON.stringify(executeBody) }); assert.equal(response.status, 202); const accepted = await response.json() as { executionId: string }; await core.wait({ tenantId: 'tenant-a', userId: 'user-a' }, accepted.executionId); const result = await fetch(`${url}/api/core/creative/${encodeURIComponent(accepted.executionId)}/result`, { headers: { authorization: 'Bearer valid-a' } }); assert.equal(result.status, 200); const text = await result.text(); assert.equal(/credential|raw|stack|database|filesystem|billing/i.test(text), false); assert.deepEqual(f.counters(), { providerCalls: 1, billingMutations: 2 }); });

test('scope attack and ownership checks fail closed', async t => { const f = fixture(); const { core, server, url } = await serverFor(f.dependencies); t.after(() => server.close()); const attack = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { authorization: 'Bearer valid-b', 'content-type': 'application/json' }, body: JSON.stringify(executeBody) }); assert.equal(attack.status, 403); assert.deepEqual(f.counters(), { providerCalls: 0, billingMutations: 0 }); const accepted = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { authorization: 'Bearer valid-a', 'content-type': 'application/json' }, body: JSON.stringify(executeBody) }).then(r => r.json()) as { executionId: string }; await core.wait({ tenantId: 'tenant-a', userId: 'user-a' }, accepted.executionId); for (const suffix of ['status', 'result']) assert.equal((await fetch(`${url}/api/core/creative/${encodeURIComponent(accepted.executionId)}/${suffix}`, { headers: { authorization: 'Bearer valid-b' } })).status, 403); assert.equal((await fetch(`${url}/api/core/creative/${encodeURIComponent(accepted.executionId)}/cancel`, { method: 'POST', headers: { authorization: 'Bearer valid-b' } })).status, 403); });

test('legacy URL adapter blocks SSRF schemes and untrusted hosts without side effects', async t => { const f = fixture(); const { server, url } = await serverFor(f.dependencies); t.after(() => server.close()); for (const inputArtifact of ['http://localhost/a', 'http://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'https://evil.example/a']) { const response = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { authorization: 'Bearer valid-a', 'content-type': 'application/json' }, body: JSON.stringify({ ...executeBody, artifactId: undefined, inputArtifact, clientRequestId: `request-${Math.random()}` }) }); assert.equal(response.status, 403); } assert.deepEqual(f.counters(), { providerCalls: 0, billingMutations: 0 }); });

test('startup validation fails before serving and production server has no browser provider import', async () => { const f = fixture(); assert.throws(() => createCreativeCore({ ...f.dependencies, auth: undefined } as never), /authentication verifier/); assert.throws(() => createCreativeCore({ ...f.dependencies, platform: { ...f.dependencies.platform, capabilityAdmission: undefined } } as never), /execution capability admission/); const source = await import('node:fs/promises').then(fs => fs.readFile('server/core/composition/createCreativeCore.ts', 'utf8')); assert.equal(source.includes('src/lib/editing/'), false); });
test('provider credential validation names the provider but never the secret', () => { const secret = 'super-secret-value'; assert.throws(() => readProviderEnvironment({ CREATIVE_PROVIDER: 'FAL' }), /^Error: Provider credential missing: FAL$/); const selected = readProviderEnvironment({ CREATIVE_PROVIDER: 'FAL', FAL_KEY: secret }); assert.equal(selected.provider, 'FAL'); assert.equal(JSON.stringify({ provider: selected.provider }).includes(secret), false); });
