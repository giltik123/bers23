import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CanonicalDecisionService,
  CanonicalPlanningService,
  CreativeExecutionPlatform,
} from '../../../src/platform/creative/canonical/index.ts';
import {
  LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES,
  LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT,
} from '../../../src/platform/creative/canonical/localComposite.ts';
import { productionExecutionCapabilities } from '../providers/productionExecutionCapabilities.ts';
import { productionExecutionRoute } from '../providers/productionExecutionRoute.ts';
import { productionProviderSelection } from '../providers/productionProviderSelection.ts';
import { productionTargetSelection } from '../providers/productionTargetSelection.ts';
import { productionWorkflowVerifier } from '../providers/productionWorkflowVerifier.ts';
import { LOCAL_COMPOSITE_CONTINUATION_STEPS } from './LocalCompositeContinuationService.ts';

const scope = Object.freeze({ tenantId: 'tenant', userId: 'user', projectId: 'project' });
const source = Object.freeze({
  id: 'original-image',
  kind: 'image',
  value: Object.freeze({ width: 4, height: 4, data: new Uint8ClampedArray(64), format: 'RGBA8', orientation: 1, colorSpace: 'srgb' }),
  producerOperationId: 'user-input',
  scope,
  state: 'AVAILABLE',
  role: 'ORIGINAL',
  image: Object.freeze({ width: 4, height: 4, format: 'RGBA8', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: 'a'.repeat(64) }),
});
const request = Object.freeze({
  id: 'c5b-canonical-admission-test',
  intent: 'local segment and background isolation composite',
  scope,
  inputArtifacts: Object.freeze([source]),
  budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
  metadata: Object.freeze({
    operationIntent: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT,
    selectionRequestId: 'selection:test',
    analysis: Object.freeze({ originalWidth: 4, originalHeight: 4, analysisWidth: 4, analysisHeight: 4, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }),
    points: Object.freeze([Object.freeze({ x: 1, y: 1, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' })]),
    idempotencyKey: 'c5b-canonical-admission-test',
    planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 }),
  }),
});

function platform(planning, counter) {
  return new CreativeExecutionPlatform({
    runtime: Object.freeze({ execute: async () => { counter.calls += 1; throw new Error('admission must not execute runtime'); } }),
    providers: Object.freeze({ isAvailable: () => false, fallback: () => undefined }),
    decision: new CanonicalDecisionService(),
    planning,
    routeSelector: productionExecutionRoute,
    targetSelector: productionTargetSelection,
    providerSelector: productionProviderSelection,
    capabilityAdmission: productionExecutionCapabilities,
    securityGate: Object.freeze({ authorize: (candidateRequest, operation, target) => candidateRequest.metadata?.operationIntent === LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT && target === 'LOCAL' && Number(candidateRequest.budget?.credits ?? -1) === 0 && !operation.providerId }),
    recovery: Object.freeze({ decide: () => 'MARK_UNKNOWN' }),
    verifier: productionWorkflowVerifier,
  });
}

test('local composite remains blocked in the general planner by default', async () => {
  const decision = await new CanonicalDecisionService().decide(request);
  const plan = await new CanonicalPlanningService().plan(request, decision);
  assert.equal(plan.status, 'BLOCKED');
  assert.ok(plan.confirmationReasons.includes('LOCAL_COMPOSITE_CONTINUATION_NOT_WIRED'));
  assert.equal(plan.operations.length, 0);
});

test('narrow production admission compiles exact LOCAL_ONLY graph through canonical route and capability policy without runtime execution', async () => {
  const counter = { calls: 0 };
  const runtime = platform(new CanonicalPlanningService({ localCompositeContinuationEnabled: true }), counter);
  runtime.createExecution(request);
  const plan = await runtime.plan(request.id);
  assert.equal(plan.status, 'READY');
  assert.equal(plan.provenance.plannerConfig.localCompositeContinuationEnabled, true);
  assert.equal(plan.provenance.plannerConfig.compositeExecutionEnabled, false);
  assert.deepEqual(plan.operations.map(operation => operation.id), [
    LOCAL_COMPOSITE_CONTINUATION_STEPS.segment,
    LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation,
    LOCAL_COMPOSITE_CONTINUATION_STEPS.verify,
  ]);

  const execution = await runtime.compile(request.id);
  const expected = [
    [LOCAL_COMPOSITE_CONTINUATION_STEPS.segment, 'segment', 'ON_DEVICE', LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment],
    [LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation, 'BACKGROUND_ISOLATION', 'ON_DEVICE', LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation],
    [LOCAL_COMPOSITE_CONTINUATION_STEPS.verify, 'verify', 'INTERNAL', LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.verify],
  ];
  for (const [id, type, route, capabilityId] of expected) {
    const operation = execution.operations.find(candidate => candidate.id === id);
    assert.ok(operation);
    assert.equal(operation.type, type);
    assert.equal(operation.executionRoute, route);
    assert.equal(execution.targets[id], 'LOCAL');
    assert.equal(operation.providerId, undefined);
    const admitted = productionExecutionCapabilities.admit({ request, operation, route, target: 'LOCAL' });
    assert.equal(admitted.allowed, true);
    assert.equal(admitted.capabilityId, capabilityId);
  }
  assert.equal(counter.calls, 0);
});

test('production C5B composition cannot return an unadmitted raw sequencer', async () => {
  const sourceText = await readFile(new URL('./createProductionLocalCompositeContinuation.ts', import.meta.url), 'utf8');
  assert.match(sourceText, /class CanonicallyAdmittedLocalCompositeContinuationService extends LocalCompositeContinuationService/);
  assert.match(sourceText, /await this\.admitStart\(command, scope\);\s*return super\.start\(command, scope\);/s);
  assert.match(sourceText, /const execution = await platform\.compile\(executionId\);/);
  assert.doesNotMatch(sourceText, /return new LocalCompositeContinuationService\(/);
});
