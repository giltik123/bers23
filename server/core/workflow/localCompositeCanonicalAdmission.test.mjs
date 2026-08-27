import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

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

let runtimePromise;
async function canonicalRuntime() {
  runtimePromise ??= (async () => {
    const directory = path.resolve('.test-cache/c5b-canonical-admission');
    const outfile = path.join(directory, 'runtime.mjs');
    await mkdir(directory, { recursive: true });
    await build({
      stdin: {
        contents: `
          export { CanonicalDecisionService, CanonicalPlanningService, CreativeExecutionPlatform } from './src/platform/creative/canonical/index.ts';
          export { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES, LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT } from './src/platform/creative/canonical/localComposite.ts';
          export { productionExecutionCapabilities } from './server/core/providers/productionExecutionCapabilities.ts';
          export { productionExecutionRoute } from './server/core/providers/productionExecutionRoute.ts';
          export { productionProviderSelection } from './server/core/providers/productionProviderSelection.ts';
          export { productionTargetSelection } from './server/core/providers/productionTargetSelection.ts';
          export { productionWorkflowVerifier } from './server/core/providers/productionWorkflowVerifier.ts';
          export { LOCAL_COMPOSITE_CONTINUATION_STEPS } from './server/core/workflow/LocalCompositeContinuationService.ts';
        `,
        resolveDir: process.cwd(),
        sourcefile: 'c5b-canonical-admission-runtime.ts',
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      outfile,
      external: ['node:*', 'pg', 'sharp'],
      logLevel: 'silent',
    });
    return import(`${pathToFileURL(outfile).href}?c5b=1`);
  })();
  return runtimePromise;
}

function requestFor(operationIntent) {
  return Object.freeze({
    id: 'c5b-canonical-admission-test',
    intent: 'local segment and background isolation composite',
    scope,
    inputArtifacts: Object.freeze([source]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
    metadata: Object.freeze({
      operationIntent,
      selectionRequestId: 'selection:test',
      analysis: Object.freeze({ originalWidth: 4, originalHeight: 4, analysisWidth: 4, analysisHeight: 4, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }),
      points: Object.freeze([Object.freeze({ x: 1, y: 1, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' })]),
      idempotencyKey: 'c5b-canonical-admission-test',
      planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 }),
    }),
  });
}

function platform(runtime, planning, counter) {
  const {
    CanonicalDecisionService,
    CreativeExecutionPlatform,
    LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT,
    productionExecutionCapabilities,
    productionExecutionRoute,
    productionProviderSelection,
    productionTargetSelection,
    productionWorkflowVerifier,
  } = runtime;
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
  const runtime = await canonicalRuntime();
  const request = requestFor(runtime.LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT);
  const decision = await new runtime.CanonicalDecisionService().decide(request);
  const plan = await new runtime.CanonicalPlanningService().plan(request, decision);
  assert.equal(plan.status, 'BLOCKED');
  assert.ok(plan.confirmationReasons.includes('LOCAL_COMPOSITE_CONTINUATION_NOT_WIRED'));
  assert.equal(plan.operations.length, 0);
});

test('narrow production admission compiles exact LOCAL_ONLY graph through canonical route and capability policy without runtime execution', async () => {
  const runtimeAuthority = await canonicalRuntime();
  const request = requestFor(runtimeAuthority.LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT);
  const counter = { calls: 0 };
  const executionRuntime = platform(runtimeAuthority, new runtimeAuthority.CanonicalPlanningService({ localCompositeContinuationEnabled: true }), counter);
  executionRuntime.createExecution(request);
  const plan = await executionRuntime.plan(request.id);
  assert.equal(plan.status, 'READY');
  assert.equal(plan.provenance.plannerConfig.localCompositeContinuationEnabled, true);
  assert.equal(plan.provenance.plannerConfig.compositeExecutionEnabled, false);
  assert.deepEqual(plan.operations.map(operation => operation.id), [
    runtimeAuthority.LOCAL_COMPOSITE_CONTINUATION_STEPS.segment,
    runtimeAuthority.LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation,
    runtimeAuthority.LOCAL_COMPOSITE_CONTINUATION_STEPS.verify,
  ]);

  const [segmentPlan, isolationPlan, verifyPlan] = plan.operations;
  assert.deepEqual(segmentPlan.input, {
    selectionRequestId: request.metadata.selectionRequestId,
    analysis: request.metadata.analysis,
    points: request.metadata.points,
  });
  assert.equal(segmentPlan.outputArtifacts.length, 1);
  assert.deepEqual(isolationPlan.input, {
    sourceArtifactId: source.id,
    maskArtifactId: segmentPlan.outputArtifacts[0],
    deterministicTool: 'background-isolation@1',
  });
  assert.equal(isolationPlan.outputArtifacts.length, 1);
  assert.deepEqual(verifyPlan.input, {
    sourceArtifactId: isolationPlan.outputArtifacts[0],
    semanticOperation: 'verify',
  });
  assert.equal(verifyPlan.outputArtifacts.length, 1);

  const execution = await executionRuntime.compile(request.id);
  const expected = [
    [runtimeAuthority.LOCAL_COMPOSITE_CONTINUATION_STEPS.segment, 'segment', 'ON_DEVICE', runtimeAuthority.LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment],
    [runtimeAuthority.LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation, 'BACKGROUND_ISOLATION', 'ON_DEVICE', runtimeAuthority.LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation],
    [runtimeAuthority.LOCAL_COMPOSITE_CONTINUATION_STEPS.verify, 'verify', 'INTERNAL', runtimeAuthority.LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.verify],
  ];
  for (const [id, type, route, capabilityId] of expected) {
    const operation = execution.operations.find(candidate => candidate.id === id);
    assert.ok(operation);
    assert.equal(operation.type, type);
    assert.equal(operation.executionRoute, route);
    assert.equal(execution.targets[id], 'LOCAL');
    assert.equal(operation.providerId, undefined);
    const admitted = runtimeAuthority.productionExecutionCapabilities.admit({ request, operation, route, target: 'LOCAL' });
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
  assert.match(sourceText, /local_composite_canonical_plan_parameters/);
  assert.doesNotMatch(sourceText, /return new LocalCompositeContinuationService\(/);
});

test('canonical admission and durable continuation share one composite execution identity scheme', async () => {
  const [compositionText, sequencerText] = await Promise.all([
    readFile(new URL('./createProductionLocalCompositeContinuation.ts', import.meta.url), 'utf8'),
    readFile(new URL('./LocalCompositeContinuationService.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(compositionText, /\.update\('bers:local-background-isolation-composite:execution:v1\\0'\)/);
  assert.match(compositionText, /return `local-composite-\$\{digest\}`;/);
  assert.doesNotMatch(compositionText, /bers:c5b:canonical-admission:v1|local-composite-admission-/);
  assert.match(sequencerText, /const EXECUTION_ID_DOMAIN = 'bers:local-background-isolation-composite:execution:v1\\0';/);
  assert.match(sequencerText, /return `local-composite-\$\{createHash\('sha256'\)/);
});

test('durable sequencer requires exact root, MASK and COMPOSITE parent cardinality', async () => {
  const sequencerText = await readFile(new URL('./LocalCompositeContinuationService.ts', import.meta.url), 'utf8');
  assert.match(sequencerText, /root\.parentArtifactIds\.length !== 0/);
  assert.match(sequencerText, /mask\.parentArtifactIds\.length !== 1 \|\| mask\.parentArtifactIds\[0\] !== root\.artifactId/);
  assert.match(sequencerText, /parents\.length !== 2 \|\| parents\[0\] !== expected\[0\] \|\| parents\[1\] !== expected\[1\]/);
  assert.match(sequencerText, /local_composite_mask_lineage/);
  assert.match(sequencerText, /local_composite_image_lineage/);
});
