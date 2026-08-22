import assert from 'node:assert/strict';
import test from 'node:test';
import { CanonicalDecisionService, CanonicalPlanningService, resolveFallbackAction, validateCreativePlan, validateReplayMetadata, type CreativePlan, type CreativeRequest, type PlanningTelemetryEvent } from '../src/platform/creative/canonical/index.ts';

const scope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const request = (metadata: Record<string, unknown> = {}): CreativeRequest => ({ id: 'verification-plan', intent: 'private user instruction', scope, inputArtifacts: [{ id: 'canonical-original', kind: 'image', role: 'ORIGINAL', value: {}, producerOperationId: 'seed', scope, state: 'AVAILABLE' }], metadata });
type PlannerOptions = { plannerVersion?: string; minimumIntentConfidence?: number; minimumTargetConfidence?: number; maximumPreservationRisk?: number; compositeExecutionEnabled?: boolean };
async function create(metadata: Record<string, unknown> = {}, telemetry?: { record(event: PlanningTelemetryEvent): void | Promise<void> }, options: PlannerOptions = {}) { const input = request(metadata); return new CanonicalPlanningService({ ...options, telemetry }).plan(input, await new CanonicalDecisionService().decide(input)); }

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

test('fallback advice respects total hard envelopes, exhausts deterministically, and LOCAL_ONLY never points to cloud', async () => {
  const auto = await create({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT', planningConstraints: { executionPolicy: 'AUTO', maxCredits: 10, maxLatencyMs: 5000, minimumQuality: .7 } }, undefined, { compositeExecutionEnabled: true });
  assert.equal(auto.status, 'READY');
  const local = auto.candidates?.find(candidate => candidate.targetPreference === 'LOCAL'); const fallback = local?.fallbackAdvice?.[0]; assert.ok(fallback);
  assert.equal(fallback.action, 'ALTERNATE_CANDIDATE'); assert.ok(fallback.alternateCandidateId); assert.equal(fallback.maxAttempts, 1); assert.equal(fallback.maxGenerationDepth, 1); assert.equal(fallback.maxAdditionalCredits, 9); assert.equal(fallback.maxAdditionalLatencyMs, 3800); assert.deepEqual(fallback.inheritedConstraints, auto.planningConstraints);
  assert.equal(resolveFallbackAction(fallback, { attemptsUsed: 0, generationDepth: 0 }), 'ALTERNATE_CANDIDATE');
  assert.equal(resolveFallbackAction(fallback, { attemptsUsed: 1, generationDepth: 0 }), 'ASK_USER');
  assert.equal(resolveFallbackAction(fallback, { attemptsUsed: 0, generationDepth: 1 }), 'ASK_USER');
  assert.throws(() => (fallback.inheritedConstraints.mustPreserve as string[]).push('forged'), TypeError);

  const localOnly = await create({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT', planningConstraints: { executionPolicy: 'LOCAL_ONLY', maxCredits: 10, maxLatencyMs: 5000, minimumQuality: .7 } }, undefined, { compositeExecutionEnabled: true });
  const localOnlyFallback = localOnly.candidates?.find(candidate => candidate.targetPreference === 'LOCAL')?.fallbackAdvice?.[0]; assert.ok(localOnlyFallback);
  assert.equal(localOnlyFallback.action, 'ASK_USER'); assert.equal(localOnlyFallback.alternateCandidateId, undefined); assert.equal(localOnlyFallback.maxAttempts, 0); assert.equal(localOnlyFallback.maxGenerationDepth, 0); assert.equal(localOnlyFallback.maxAdditionalCredits, 0); assert.equal(localOnlyFallback.maxAdditionalLatencyMs, 0);
});

test('forged fallback bounds, weakened constraints, missing references, and LOCAL_ONLY cloud alternates fail closed', async () => {
  const source = await create({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT', planningConstraints: { executionPolicy: 'AUTO', maxCredits: 10, maxLatencyMs: 5000, minimumQuality: .7 } }, undefined, { compositeExecutionEnabled: true });
  const malformed = structuredClone(source) as CreativePlan; const missing = malformed.candidates![0].fallbackAdvice![0] as unknown as Record<string, unknown>; missing.stepId = 'missing'; assert.throws(() => validateCreativePlan(malformed), /missing step/);

  const unbounded = structuredClone(source) as CreativePlan; const infinite = unbounded.candidates![0].fallbackAdvice![0] as unknown as Record<string, unknown>; infinite.maxAttempts = Infinity; assert.throws(() => validateCreativePlan(unbounded), /finite and non-negative/);

  const weakened = structuredClone(source) as CreativePlan; const weak = weakened.candidates![0].fallbackAdvice![0] as unknown as Record<string, unknown>; weak.inheritedConstraints = { ...weakened.planningConstraints!, maxCredits: 999 }; assert.throws(() => validateCreativePlan(weakened), /inherit plan constraints/);

  const localOnlySource = await create({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT', planningConstraints: { executionPolicy: 'LOCAL_ONLY', maxCredits: 10, maxLatencyMs: 5000, minimumQuality: .7 } }, undefined, { compositeExecutionEnabled: true });
  const forged = structuredClone(localOnlySource) as CreativePlan; const local = forged.candidates!.find(candidate => candidate.targetPreference === 'LOCAL')!; const cloud = forged.candidates!.find(candidate => candidate.targetPreference === 'CLOUD')!; const cloudFallback = local.fallbackAdvice![0] as unknown as Record<string, unknown>; cloudFallback.action = 'ALTERNATE_CANDIDATE'; cloudFallback.alternateCandidateId = cloud.id; cloudFallback.maxAttempts = 1; cloudFallback.maxGenerationDepth = 1; cloudFallback.maxAdditionalCredits = 10; cloudFallback.maxAdditionalLatencyMs = 5000; assert.throws(() => validateCreativePlan(forged), /rejected candidate|LOCAL_ONLY/);
});

test('stale replay content and planner config fail closed, not only version mismatches', async () => {
  const source = await create();
  const versionStale = structuredClone(source) as CreativePlan; (versionStale.provenance!.replay as { verificationPolicyVersion: string }).verificationPolicyVersion = 'stale'; assert.throws(() => validateReplayMetadata(versionStale), /explicit replan/);
  const artifactStale = structuredClone(source) as CreativePlan; (artifactStale.provenance!.replay!.inputArtifacts[0] as { id: string }).id = 'other-artifact'; assert.throws(() => validateReplayMetadata(artifactStale), /input artifacts/);
  const candidateStale = structuredClone(source) as CreativePlan; (candidateStale.provenance!.replay as { selectedCandidateId?: string }).selectedCandidateId = 'other-candidate'; assert.throws(() => validateReplayMetadata(candidateStale), /selected candidate/);
  const configStale = structuredClone(source) as CreativePlan; (configStale.provenance!.replay!.plannerConfig as { minimumIntentConfidence: number }).minimumIntentConfidence = .01; assert.throws(() => validateReplayMetadata(configStale), /planner config/);
  const configured = await create({}, undefined, { minimumIntentConfidence: .8, minimumTargetConfidence: .75, maximumPreservationRisk: .6 });
  assert.deepEqual(configured.provenance?.replay?.plannerConfig, configured.provenance?.plannerConfig); assert.deepEqual(configured.explanation?.plannerConfig, configured.provenance?.plannerConfig);
});

test('explanation and replay are deterministic, structured, and secret-free', async () => {
  const metadata = { token: 'bearer-secret', cookie: 'cookie-secret', csrf: 'csrf-secret', providerKey: 'provider-secret', signedUrl: 'https://example.test/a?token=url-secret' };
  const first = await create(metadata); const second = await create(metadata);
  assert.deepEqual(first.explanation, second.explanation); assert.deepEqual(first.provenance?.replay, second.provenance?.replay);
  assert.doesNotMatch(JSON.stringify({ explanation: first.explanation, replay: first.provenance?.replay }), /private user instruction|secret|https?:/i);
  assert.ok(first.explanation?.requiredVerificationIds.length); assert.ok(first.explanation?.fallbackPaths.length);
});

test('planning telemetry is narrow, redacted, has no invented actuals, and cannot stall planning', async () => {
  const events: PlanningTelemetryEvent[] = []; const plan = await create({ token: 'secret', requestMetadata: { arbitrary: 'secret' }, signedUrl: 'https://example.test/?token=secret' }, { record: event => { events.push(event); } });
  assert.equal(plan.status, 'READY'); assert.equal(events.length, 1); assert.equal(events[0].type, 'PLAN_PROPOSED'); assert.equal(events[0].verificationCount, 1); assert.equal(events[0].fallbackCount, 1); assert.equal(events[0].actual, undefined);
  assert.doesNotMatch(JSON.stringify(events), /private user instruction|secret|https?:|cookie|csrf|oauth|providerKey/i);
  await assert.doesNotReject(create({}, { record: () => { throw new Error('sink unavailable'); } }));
  let hangingSinkCalled = false;
  const race = await Promise.race([
    create({}, { record: () => { hangingSinkCalled = true; return new Promise<void>(() => {}); } }).then(() => 'resolved' as const),
    new Promise<'stalled'>(resolve => setImmediate(() => resolve('stalled'))),
  ]);
  assert.equal(hangingSinkCalled, true); assert.equal(race, 'resolved');
});
