import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CreativeVerticalSlice, CreativeVerticalSliceDebugger, RealQualityGate, type ImageArtifact, type LocalInferencePort, type OperationName } from '../src/platform/creative/vertical-slice/index.ts';
import type { CreativeProvider } from '../src/platform/creative/providers/fal/index.ts';

const scope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const artifact = (id = 'input', value = 1): ImageArtifact => { const bytes = new Uint8Array([137, 80, 78, 71, value]); return { id, mimeType: 'image/png', bytes, width: 32, height: 32, hash: digest(bytes), createdAt: 1, metadata: {} }; };
const quality = (score: number) => ({ quality: score, goalCompletion: score, artifactIntegrity: 1, identityPreservation: .95, operationSuccess: 1 });
const local = (scores: Partial<Record<OperationName, number>> = {}, unavailable: OperationName[] = [], fail: OperationName[] = []): LocalInferencePort => ({
  available: operation => !unavailable.includes(operation),
  infer: async ({ operation, artifact: input }) => { if (fail.includes(operation)) throw new Error('local unavailable'); const output = artifact(`local-${operation}`, input.bytes.at(-1)! + 1); return { artifact: output, quality: quality(scores[operation] ?? .95), model: operation === 'upscale' ? 'real-esrgan-class' : 'local-analysis-segmentation', latencyMs: 10 }; },
});
const fal = (calls: string[], score = .95): CreativeProvider => ({
  name: 'fal', supports: () => true, health: () => ({ provider: 'fal', status: 'healthy', successes: 1, failures: 0 }),
  execute: async request => { calls.push(request.capability); const output = artifact(`fal-${request.capability}`, calls.length + 20); return { id: output.id, provider: 'fal', requestId: 'request', scope: request.scope, status: 'succeeded', artifacts: [{ url: 'memory://result', mimeType: output.mimeType, size: output.bytes.length, hash: output.hash, bytes: output.bytes }], data: { quality: score, width: output.width, height: output.height, model: 'fal-production' }, metrics: { latencyMs: 50, cost: 4, costSource: 'provider', retries: 0, pollCount: 0 }, createdAt: 2 }; },
  history: () => [], snapshot: () => undefined, replay: () => { throw new Error('unused'); }, debug: () => [],
});
const create = (localPort: LocalInferencePort, cloud?: CreativeProvider) => new CreativeVerticalSlice({ providers: { local: localPort, fal: cloud }, hash: async bytes => digest(bytes), id: (() => { let id = 0; return () => `id-${++id}`; })(), now: (() => { let time = 0; return () => ++time; })() });

test('Scenario A: real artifact bytes flow through local analysis and upscale with zero cloud calls', async () => {
  const calls: string[] = []; const result = await create(local(), fal(calls)).execute({ scope, scenario: 'SMART_UPSCALE', prompt: 'upscale', image: artifact() });
  assert.equal(result.status, 'COMPLETED'); assert.deepEqual(result.executionSnapshot.processingPath, ['LOCAL', 'LOCAL']); assert.equal(calls.length, 0); assert.equal(result.costSummary.cloudCredits, 0); assert.equal(result.finalArtifact?.id, 'local-upscale'); assert.equal(result.metadata.cloudAvoidanceRate, 1);
});

test('Scenario B: insufficient local segmentation escalates through existing Fal provider contract', async () => {
  const calls: string[] = []; const result = await create(local({ segmentation: .1 }), fal(calls)).execute({ scope, scenario: 'SMART_BACKGROUND_EDIT', prompt: 'remove background', image: artifact(), qualityThreshold: .8 });
  assert.equal(result.status, 'COMPLETED'); assert.ok(calls.includes('segmentation')); assert.ok(result.executionSnapshot.processingPath.join(' → ').includes('LOCAL → FAL')); assert.equal(result.telemetry.some(event => event.type === 'Escalated'), true); assert.equal(result.costSummary.cloudCredits, 4);
});

test('Scenario C: generative luxury edit uses Reve after local analysis', async () => {
  let reveCalls = 0; const reve = { execute: async ({ artifact: input }: { artifact: ImageArtifact }) => { reveCalls += 1; return { artifact: artifact('reve-luxury', input.bytes.at(-1)! + 1), quality: quality(.96), model: 'reve-edit', latencyMs: 80, actualCost: 6 }; } };
  const slice = new CreativeVerticalSlice({ providers: { local: local({}, ['generative-edit']), reve }, hash: async bytes => digest(bytes) });
  const result = await slice.execute({ scope, scenario: 'GENERATIVE_EDIT', prompt: 'change atmosphere to a luxury campaign', image: artifact() });
  assert.equal(result.status, 'COMPLETED'); assert.equal(reveCalls, 1); assert.deepEqual(result.executionSnapshot.processingPath, ['LOCAL', 'REVE']); assert.match(result.explanation, /reve/);
});

test('Scenario D: LOCAL_ONLY blocks an unsupported operation without cloud disclosure', async () => {
  const calls: string[] = []; const result = await create(local({}, ['generative-edit']), fal(calls)).execute({ scope, scenario: 'GENERATIVE_EDIT', prompt: 'luxury campaign', image: artifact(), privacyMode: 'LOCAL_ONLY' });
  assert.equal(result.status, 'BLOCKED'); assert.equal(calls.length, 0); assert.match(result.reason!, /forbidden/); assert.equal(result.finalArtifact, undefined);
});

test('Scenario E: cloud disabled and local unavailable fails gracefully', async () => {
  const result = await create(local({}, ['analysis'])).execute({ scope, scenario: 'SMART_UPSCALE', prompt: 'upscale', image: artifact(), cloudAllowed: false });
  assert.equal(result.status, 'BLOCKED'); assert.match(result.reason!, /unavailable locally/);
});

test('local inference failure falls back to Fal and records immutable, secret-free telemetry', async () => {
  const calls: string[] = []; const result = await create(local({}, [], ['analysis']), fal(calls)).execute({ scope, scenario: 'SMART_UPSCALE', prompt: 'upscale', image: artifact() });
  assert.equal(result.status, 'COMPLETED'); assert.equal(result.telemetry.some(event => event.type === 'Fallback'), true); assert.equal(Object.isFrozen(result.telemetry[0]), true); assert.equal(/apiKey|authorization|secret/.test(JSON.stringify(result.telemetry)), false);
});

test('quality gate covers all required production dimensions', () => {
  const result = new RealQualityGate().evaluate({ quality: 1, goalCompletion: 1, artifactIntegrity: 0, identityPreservation: 1, operationSuccess: 1 }, .8);
  assert.equal(result.decision, 'ESCALATE'); assert.ok(result.reasons.includes('artifactIntegrity below 0.8'));
});

test('artifact integrity rejects tampered bytes before inference', async () => {
  const input = artifact(); input.bytes[0] = 0; const result = await create(local()).execute({ scope, scenario: 'SMART_UPSCALE', prompt: 'upscale', image: input });
  assert.equal(result.status, 'FAILED'); assert.match(result.reason!, /hash mismatch/i);
});

test('debugger returns complete structured vertical-slice trace and economics', async () => {
  const request = { scope, scenario: 'SMART_UPSCALE' as const, prompt: 'upscale', image: artifact() }; const result = await create(local()).execute(request); const debug = new CreativeVerticalSliceDebugger().inspect(request, result);
  assert.equal(debug.prompt, 'upscale'); assert.equal(debug.intent, 'SMART_UPSCALE'); assert.ok(debug.executionGraph.length); assert.equal(debug.actualResult, 'COMPLETED'); assert.equal(debug.realCost.cloudCredits, 0);
});

test('privacy modes never let a local model receive authority or secrets', async () => {
  let captured: unknown; const port: LocalInferencePort = { available: () => true, infer: async request => { captured = request; return { artifact: artifact('safe'), quality: quality(.95), model: 'sandboxed', latencyMs: 1 }; } };
  await create(port).execute({ scope, scenario: 'SMART_UPSCALE', prompt: 'safe prompt', image: artifact(), privacyMode: 'PRIVACY_FIRST' });
  const serialized = JSON.stringify(captured); for (const forbidden of ['apiKey', 'billing', 'filesystem', 'network', 'tenantId']) assert.equal(serialized.includes(forbidden), false);
});
