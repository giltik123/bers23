import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CanonicalDecisionService,
  CanonicalPlanningService,
  validateCreativePlan,
  type CreativePlan,
  type CreativeRequest,
} from '../src/platform/creative/canonical/index.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const intent = 'remove subject, replace background, and relight';
const original = Object.freeze({ id: 'original', kind: 'image', value: {}, producerOperationId: 'seed', scope, state: 'AVAILABLE' as const, role: 'ORIGINAL' as const });
const request = (metadata: Record<string, unknown> = {}, inputArtifacts: CreativeRequest['inputArtifacts'] = [original]): CreativeRequest => ({ id: 'semantic-io', intent, scope, inputArtifacts, metadata });
const plan = async (metadata: Record<string, unknown> = {}, enabled = false, inputArtifacts: CreativeRequest['inputArtifacts'] = [original]) => {
  const value = request(metadata, inputArtifacts);
  return new CanonicalPlanningService({ compositeExecutionEnabled: enabled }).plan(value, await new CanonicalDecisionService().decide(value));
};

test('composite DAG keeps five deterministic nodes with semantically correct image/mask flow', async () => {
  const blocked = await plan({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT' });
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.operations.length, 0);
  assert.ok(blocked.confirmationReasons?.includes('COMPOSITE_EXECUTION_NOT_WIRED'));

  const enabled = await plan({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT' }, true);
  assert.equal(enabled.status, 'READY');
  validateCreativePlan(enabled, ['original']);
  const selected = enabled.candidates?.find(candidate => candidate.id === enabled.selectedCandidateId);
  assert.ok(selected);
  assert.deepEqual(selected.operations.map(operation => operation.type), ['segment', 'remove', 'background_replace', 'relight', 'verify']);
  assert.deepEqual(selected.operations.map(operation => operation.dependencies), [[], ['local-efficient-01-segment'], ['local-efficient-02-remove'], ['local-efficient-03-background-replace'], ['local-efficient-04-relight']]);
  assert.deepEqual(selected.operations.map(operation => operation.produces), [['mask'], ['image'], ['image'], ['image'], ['image']]);
  assert.deepEqual(selected.operations.map(operation => operation.requiredArtifacts), [
    ['original'],
    ['original', 'local-efficient:segmentation'],
    ['local-efficient:removed'],
    ['local-efficient:background'],
    ['local-efficient:relit'],
  ]);
  assert.deepEqual(selected.operations.map(operation => operation.outputArtifacts), [
    ['local-efficient:segmentation'],
    ['local-efficient:removed'],
    ['local-efficient:background'],
    ['local-efficient:relit'],
    ['local-efficient:verified'],
  ]);

  const [segment, remove, background, relight, verify] = selected.operations;
  assert.equal(segment.verification?.[0].expectedOutputKind, 'mask');
  assert.equal(segment.verification?.[0].criterion, 'output-is-mask');
  for (const operation of [remove, background, relight]) {
    assert.equal(operation.verification?.[0].expectedOutputKind, 'image');
    assert.equal(operation.verification?.[0].criterion, 'output-is-image');
  }
  assert.equal(verify.verification?.[0].expectedOutputKind, 'image');
  assert.equal(verify.verification?.[0].criterion, 'canonical-runtime-verifier-valid');

  for (const operation of selected.operations) {
    assert.deepEqual(operation.input, { intent, semanticOperation: operation.type });
    assert.equal(Object.isFrozen(operation.input), true);
    assert.equal(operation.providerId, undefined);
  }
  const serialized = JSON.stringify(selected.operations);
  assert.doesNotMatch(serialized, /fal-ai|https?:\/\/|api[_-]?key|bearer|token|providerId/i);
});

test('composite planning requires an explicit canonical ORIGINAL role', async () => {
  const unroledImage = Object.freeze({ ...original, id: 'image-without-original-role', role: undefined });
  const result = await plan({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT' }, true, [unroledImage]);
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.operations, []);
  assert.ok(result.confirmationReasons?.includes('CANONICAL_ORIGINAL_REQUIRED'));
  assert.ok(result.provenance?.reasons.includes('CANONICAL_ORIGINAL_REQUIRED'));
});

test('plan validation rejects declared output cardinality mismatch before workflow compilation', () => {
  const make = (operations: CreativePlan['operations']): CreativePlan => ({ requestId: 'bad-io', status: 'READY', operations, provenance: { plannerVersion: 'compat', decisionGoal: 'bad', inputArtifacts: [{ id: 'original', kind: 'image', role: 'ORIGINAL' }], reasons: [] } });
  assert.throws(() => validateCreativePlan(make([{ id: 'bad', type: 'segment', requiredArtifacts: ['original'], produces: ['mask', 'image'], outputArtifacts: ['one-output'] }])), /output artifact contract mismatch/);
  assert.throws(() => validateCreativePlan(make([{ id: 'bad', type: 'segment', requiredArtifacts: ['original'], produces: ['mask'], outputArtifacts: [] }])), /output artifact contract mismatch/);
});

test('prior operation/verification replay versions fail closed and require explicit replan', async () => {
  const current = await plan({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT' }, true);
  validateCreativePlan(current, ['original']);
  for (const mutation of [
    (value: any) => { value.provenance.replay.operationRulesVersion = 'decomposition/1'; },
    (value: any) => { value.provenance.replay.verificationPolicyVersion = 'verification/1'; },
  ]) {
    const stale = structuredClone(current) as any;
    mutation(stale);
    assert.throws(() => validateCreativePlan(stale, ['original']), /stale or incompatible replay metadata/);
  }
});

test('simple GLOBAL_EDIT and CONTROLLED_LOCAL_EDIT operation contracts stay compatible', async () => {
  const globalRequest = request();
  const global = await new CanonicalPlanningService().plan(globalRequest, await new CanonicalDecisionService().decide(globalRequest));
  const [{ verification: globalVerification, ...globalOperation }] = global.operations;
  assert.deepEqual(globalOperation, {
    id: 'creative-image-edit', type: 'image-edit', providerId: 'fal', requiredArtifacts: ['original'], produces: ['image'],
    input: { prompt: intent, correlationId: undefined },
  });
  assert.equal(globalVerification?.[0].expectedOutputKind, 'image');

  const mask = Object.freeze({ id: 'mask', kind: 'mask', value: {}, producerOperationId: 'seed', scope, state: 'AVAILABLE' as const, role: 'MASK' as const });
  const controlledRequest = request({ editCapability: 'CONTROLLED_LOCAL_EDIT', selectedObjectIds: ['object-1'], preserveMode: 'BALANCED', correlationId: 'corr-1' }, [original, mask]);
  const controlled = await new CanonicalPlanningService().plan(controlledRequest, await new CanonicalDecisionService().decide(controlledRequest));
  const [{ verification: controlledVerification, ...controlledOperation }] = controlled.operations;
  assert.deepEqual(controlledOperation, {
    id: 'creative-image-edit', type: 'CONTROLLED_LOCAL_EDIT', providerId: 'fal', requiredArtifacts: ['original', 'mask'], produces: ['image'],
    input: { instruction: intent, preserveMode: 'BALANCED', correlationId: 'corr-1' },
  });
  assert.equal(controlledVerification?.[0].expectedOutputKind, 'image');
});
