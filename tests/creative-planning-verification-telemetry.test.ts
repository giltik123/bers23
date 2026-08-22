import assert from 'node:assert/strict';
import test from 'node:test';
import { CanonicalDecisionService, CanonicalPlanningService, validateCreativePlan, validateReplayMetadata, type CreativePlan, type CreativeRequest, type PlanningTelemetryEvent } from '../src/platform/creative/canonical/index.ts';

const scope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const request = (metadata: Record<string, unknown> = {}): CreativeRequest => ({ id: 'verification-plan', intent: 'private user instruction', scope, inputArtifacts: [{ id: 'canonical-original', kind: 'image', role: 'ORIGINAL', value: {}, producerOperationId: 'seed', scope, state: 'AVAILABLE' }], metadata });
async function create(metadata: Record<string, unknown> = {}, telemetry?: { record(event: PlanningTelemetryEvent): void | Promise<void> }) { const input = request(metadata); return new CanonicalPlanningService({ telemetry }).plan(input, await new CanonicalDecisionService().decide(input)); }

test('simple and composite plans carry deterministic immutable serializable verification expectations', async () => {
  const simple = await create(); const again = await create();
  assert.deepEqual(simple.operations[0].verification, again.operations[0].verification);
  assert.equal(simple.operations[0].verification?.[0].required, true);
  assert.doesNotThrow(() => JSON.stringify(simple.operations[0].verification));
  assert.throws(() => (simple.operations[0].verification as unknown[]).push({}), TypeError);
  const composite = await create({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT' });
  assert.equal(composite.status, 'BLOCKED'); assert.ok(composite.confirmationReasons?.includes('COMPOSITE_EXECUTION_NOT_WIRED'));
  assert.equal(composite.candidates?.every(candidate => candidate.operations.every(operation => operation.verification?.length)), true);
});

test('fallback advice is bounded, constraint-inheriting, referentially valid and LOCAL_ONLY never points to cloud', async () => {
  const plan = await create({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT', planningConstraints: { executionPolicy: 'LOCAL_ONLY', maxCredits: 2, maxLatencyMs: 1500, minimumQuality: .7 } });
  const local = plan.candidates?.find(candidate => candidate.targetPreference === 'LOCAL'); const fallback = local?.fallbackAdvice?.[0]; assert.ok(fallback);
  assert.equal(fallback.action, 'ASK_USER'); assert.equal(fallback.alternateCandidateId, undefined); assert.equal(fallback.maxAttempts, 1); assert.equal(fallback.maxGenerationDepth, 1); assert.equal(fallback.maxAdditionalCredits, 2); assert.equal(fallback.maxAdditionalLatencyMs, 1500); assert.deepEqual(fallback.inheritedConstraints, plan.planningConstraints);
  assert.throws(() => (fallback.inheritedConstraints.mustPreserve as string[]).push('forged'), TypeError);
});

test('malformed fallback and stale replay metadata fail closed', async () => {
  const source = await create();
  const malformed = structuredClone(source) as CreativePlan; const candidate = malformed.candidates![0] as { fallbackAdvice: Array<Record<string, unknown>> }; candidate.fallbackAdvice[0].stepId = 'missing'; assert.throws(() => validateCreativePlan(malformed), /missing step/);
  const stale = structuredClone(source) as CreativePlan; (stale.provenance!.replay as { verificationPolicyVersion: string }).verificationPolicyVersion = 'stale'; assert.throws(() => validateReplayMetadata(stale), /explicit replan/);
});

test('explanation and replay are deterministic, structured, and secret-free', async () => {
  const metadata = { token: 'bearer-secret', cookie: 'cookie-secret', csrf: 'csrf-secret', providerKey: 'provider-secret', signedUrl: 'https://example.test/a?token=url-secret' };
  const first = await create(metadata); const second = await create(metadata);
  assert.deepEqual(first.explanation, second.explanation); assert.deepEqual(first.provenance?.replay, second.provenance?.replay);
  assert.doesNotMatch(JSON.stringify({ explanation: first.explanation, replay: first.provenance?.replay }), /private user instruction|secret|https?:/i);
  assert.ok(first.explanation?.requiredVerificationIds.length); assert.ok(first.explanation?.fallbackPaths.length);
});

test('planning telemetry is narrow, redacted, has no invented actuals, and sink failure is best effort', async () => {
  const events: PlanningTelemetryEvent[] = []; const plan = await create({ token: 'secret', requestMetadata: { arbitrary: 'secret' }, signedUrl: 'https://example.test/?token=secret' }, { record: event => { events.push(event); } });
  assert.equal(plan.status, 'READY'); assert.equal(events.length, 1); assert.equal(events[0].type, 'PLAN_PROPOSED'); assert.equal(events[0].verificationCount, 1); assert.equal(events[0].fallbackCount, 1); assert.equal(events[0].actual, undefined);
  assert.doesNotMatch(JSON.stringify(events), /private user instruction|secret|https?:|cookie|csrf|oauth|providerKey/i);
  await assert.doesNotReject(create({}, { record: () => { throw new Error('sink unavailable'); } }));
});

