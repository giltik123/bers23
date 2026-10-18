import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { createFalWorkflowRuntime } from '../server/core/providers/falWorkflowRuntime.ts';
import { CreativeExecutionService, creativeRequestFingerprint } from '../server/core/application/creativeExecutionService.ts';
import { createVirtualTryOnGarmentResolver } from '../server/core/fashion/resolveVirtualTryOnGarment.ts';
import { CanonicalPlanningService } from '../src/platform/creative/canonical/planning/CanonicalPlanningService.ts';
import { productionExecutionRoute } from '../server/core/providers/productionExecutionRoute.ts';
import { productionTargetSelection } from '../server/core/providers/productionTargetSelection.ts';
import { productionProviderSelection } from '../server/core/providers/productionProviderSelection.ts';
import { productionExecutionCapabilities } from '../server/core/providers/productionExecutionCapabilities.ts';
import { ProductionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';
import { deriveDestinationGarmentMesh } from '../server/core/fashion/bodyAnchorGeometry.ts';
const scope = { tenantId: 'tenant', userId: 'user', projectId: 'project' };
const pixels = { width: 4, height: 6, data: new Uint8ClampedArray(96).fill(160), format: 'RGBA8', orientation: 1 as const };
const command = { projectId: 'project', inputArtifactId: 'person', instruction: 'Virtual garment try-on', garmentId: 'garment', tryOnConsent: true, clientRequestId: 'request' };
const source = { id: 'person', kind: 'image', value: pixels, scope, producerOperationId: 'upload', state: 'AVAILABLE' as const, role: 'ORIGINAL' as const };
const reference = { identity: 'reference-sha', category: 'tops' as const, artifact: { ...source, id: 'garment', role: 'WORKING' as const, metadata: { virtualTryOnReference: true } } };

async function fixture(output?: Uint8Array, queued = false) {
  const png = output ?? await sharp({ create: { width: 4, height: 6, channels: 4, background: '#579bdf' } }).png().toBuffer();
  const outgoing: { url: string; body: any }[] = [];
  const uploads: Uint8Array[] = [];
  const runtime = createFalWorkflowRuntime({ apiKey: 'test-key', baseUrl: 'https://queue.fal.test', timeoutMs: 1000, artifacts: {} as never,
    fetcher: async (url, init) => {
      if (String(url) === 'https://cdn.fashn.ai/output.png') return new Response(png, { headers: { 'content-type': 'image/png' } });
      if (init?.method === 'GET' && String(url).endsWith('/status')) return Response.json({ status: 'COMPLETED' });
      if (init?.method === 'GET') return Response.json({ images: [{ url: 'https://cdn.fashn.ai/output.png' }] });
      outgoing.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      if (queued) return Response.json({ request_id: 'queued-test', status_url: 'https://queue.fal.test/requests/queued-test/status', response_url: 'https://queue.fal.test/requests/queued-test', cancel_url: 'https://queue.fal.test/requests/queued-test/cancel' }, { status: 202 });
      return Response.json({ images: [{ url: 'https://cdn.fashn.ai/output.png' }] });
    },
    materializer: { materialize: async input => { uploads.push(input.bytes); return { url: `https://fal.media/input-${uploads.length}.png`, byteSize: input.bytes.length, width: 4, height: 6 }; } },
  });
  let persisted: any; const events: string[] = [];
  const service = new CreativeExecutionService({
    ownsArtifacts: async () => true, hydrateArtifacts: async () => [source], resolveTryOnGarment: async () => reference,
    persistFinal: async (_scope, _execution, artifact) => { persisted = artifact; return { ...artifact, id: 'durable-final', value: { url: '/core/result' } }; },
    platform: { runtime, decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
      planning: new CanonicalPlanningService(), routeSelector: productionExecutionRoute, targetSelector: productionTargetSelection,
      providerSelector: productionProviderSelection, capabilityAdmission: productionExecutionCapabilities,
      securityGate: { authorize: () => true }, providers: { isAvailable: () => true, fallback: () => undefined },
      verifier: new ProductionWorkflowVerifier(), recovery: { decide: () => 'MARK_UNKNOWN' },
      billing: { reserve: async () => { events.push('reserve'); return { reservationId: 'r', status: 'RESERVED' }; }, commit: async id => { events.push('commit'); return { reservationId: id, status: 'COMMITTED' }; }, release: async id => { events.push('release'); return { reservationId: id, status: 'RELEASED' }; }, unknown: async id => ({ reservationId: id, status: 'UNKNOWN' }) },
      now: Date.now, id: (() => { let n = 0; return () => `id-${++n}`; })(),
    },
  });
  return { service, runtime, outgoing, uploads, events, persisted: () => persisted };
}

test('canonical pipeline reaches FASHN with two full photos, persists decoded FINAL and reuses same request', async () => {
  const f = await fixture();
  const outcome = await f.service.execute(command, scope);
  assert.equal(outcome.status, 'SUCCESS', JSON.stringify(outcome));
  assert.equal(outcome.artifacts.find(a => a.role === 'COMPOSITE')?.id, 'durable-final');
  assert.equal(f.outgoing.length, 1);
  assert.match(f.outgoing[0].url, /fal-ai\/fashn\/tryon\/v1.6/);
  assert.deepEqual(f.outgoing[0].body, { model_image: 'https://fal.media/input-1.png', garment_image: 'https://fal.media/input-2.png', category: 'tops', garment_photo_type: 'auto', mode: 'quality', num_samples: 1, output_format: 'png', enable_safety_checker: true });
  assert.equal(f.uploads.length, 2);
  assert.deepEqual(f.persisted().metadata.parentArtifactIds, ['person', 'garment']);
  assert.equal(f.persisted().metadata.sourceArtifactId, 'person');
  assert.deepEqual([f.persisted().value.width, f.persisted().value.height], [4, 6]);
  assert.ok(f.persisted().value.data instanceof Uint8ClampedArray);
  await f.service.execute(command, scope);
  assert.equal(f.outgoing.length, 1);
  assert.deepEqual(f.events, ['reserve', 'commit']);
});

test('without cloud consent no photos are sent and masks cannot silently become full image try-on', async () => {
  const f = await fixture();
  await assert.rejects(f.service.execute({ ...command, tryOnConsent: false }, scope), /consent/);
  await assert.rejects(f.service.execute({ ...command, maskArtifactIds: ['mask'], selectedObjectIds: ['object'] }, scope), /consent|masks/);
  assert.equal(f.outgoing.length, 0); assert.equal(f.uploads.length, 0); assert.deepEqual(f.events, []);
});

test('invalid output never becomes a saved preview or geometric fallback', async () => {
  const f = await fixture(new Uint8Array([1, 2, 3]));
  const outcome = await f.service.execute(command, scope);
  assert.notEqual(outcome.status, 'SUCCESS'); assert.equal(f.persisted(), undefined);
  assert.equal(f.outgoing.length, 1); assert.equal(f.events.includes('commit'), false);
});

test('garment image revision participates in replay identity', () => {
  const artifacts = { inputArtifactIdentity: 'person', maskArtifactIdentities: [] };
  assert.notEqual(creativeRequestFingerprint(command, artifacts, 'revision-one'), creativeRequestFingerprint(command, artifacts, 'revision-two'));
});

test('canonical resolver rejects stale project and unavailable/foreign garments before decoding', async () => {
  let garmentReads = 0;
  const deps = { artifacts: { resolveStoredImageEvidence: async () => ({ storageId: 'old-source' }) }, projects: { get: async () => ({ current_image_storage_id: 'current-source' }) }, garments: { get: async () => { garmentReads++; return undefined; }, loadView: async () => { throw new Error('must not read image'); } }, wardrobe: { get: async () => undefined } };
  const resolver = createVirtualTryOnGarmentResolver(deps as never);
  await assert.rejects(resolver(scope, 'foreign-garment', 'person'), (e: any) => e.status === 409);
  assert.equal(garmentReads, 0);
  deps.projects.get = async () => ({ current_image_storage_id: 'old-source' });
  await assert.rejects(resolver(scope, 'foreign-garment', 'person'), (e: any) => e.status === 404);
});

test('off-centre garment extent fills torso frame rather than shrinking to a narrow strip', () => {
  const input = { anchorPayload: { schemaVersion: 1, coordinateSpace: 'PROJECT_IMAGE_NORMALIZED', anchors: { leftShoulder: [.36,.235], rightShoulder: [.64,.235], leftHip: [.39,.49], rightHip: [.61,.49] } }, garmentCategory: 'jackets' as const,
    sourcePoints: [[.49,.38],[.83,.38],[.83,.99],[.49,.99]], triangles: [[0,1,2],[0,2,3]], provenance: {} as never };
  const mesh = deriveDestinationGarmentMesh(input);
  const full = deriveDestinationGarmentMesh({ ...input, sourcePoints: [[0,0],[1,0],[1,1],[0,1]] });
  assert.deepEqual(mesh.destinationPointsQ16, full.destinationPointsQ16);
  assert.notDeepEqual(mesh.sourcePointsQ16, full.sourcePointsQ16);
  const width = (mesh.destinationPointsQ16[1][0] - mesh.destinationPointsQ16[0][0]) / 65536;
  assert.ok(width > .279 && width < .281);
});

test('unexpected output aspect ratio fails instead of stretching a different composition', async () => {
  const png = await sharp({ create: { width: 6, height: 4, channels: 4, background: '#123456' } }).png().toBuffer();
  const f = await fixture(png);
  const outcome = await f.service.execute(command, scope);
  assert.notEqual(outcome.status, 'SUCCESS'); assert.equal(f.persisted(), undefined);
  assert.equal(f.events.includes('commit'), false);
});

test('runtime refuses cross-scope garment pixels before uploading either photo', async () => {
  const f = await fixture();
  await assert.rejects(f.runtime.execute({ workflowId: 'foreign', scope,
    operation: { id: 'try-on', type: 'VIRTUAL_TRY_ON', providerId: 'fal', input: { sourceArtifactId: 'person', referenceArtifactId: 'garment', category: 'tops' } },
    artifacts: [{ ...source, producerStepId: 'upload' }, { ...reference.artifact, producerStepId: 'upload', scope: { ...scope, userId: 'foreign' } }],
  }), /canonical person and managed garment/);
  assert.equal(f.uploads.length, 0); assert.equal(f.outgoing.length, 0);
});


test('disabled production provider fails before loading or transmitting photos', async () => {
  const resolver = createVirtualTryOnGarmentResolver({ enabled: false } as never);
  await assert.rejects(resolver(scope, 'garment', 'person'), (e: any) => e.status === 503 && e.code === 'fashion_unavailable');
});


test('actual queue-shaped FAL response polls control URLs before downloading only the final image', async () => {
  const f = await fixture(undefined, true);
  const outcome = await f.service.execute(command, scope);
  assert.equal(outcome.status, 'SUCCESS');
  assert.equal(f.outgoing.length, 1);
  assert.ok(f.persisted());
  assert.deepEqual(f.events, ['reserve','commit']);
});

test('queue control URL cannot send the provider key to another origin', async () => {
  const { FalJobTracker } = await import('../src/platform/creative/providers/fal/FalJobTracker.ts');
  let calls = 0;
  const tracker = new FalJobTracker({ api: { baseUrl: 'https://queue.fal.test' }, transport: { send: async () => { calls++; } }, clock: Date.now } as never);
  await assert.rejects(tracker.wait({ requestId: 'request', statusUrl: 'https://evil.example/status', responseUrl: 'https://queue.fal.test/result' }, Date.now() + 1000), /authenticated API origin/);
  assert.equal(calls, 0);
});
