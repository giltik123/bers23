import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeWorkflowContinuationCreate,
  normalizeWorkflowPlanParameters,
  samePlanBinding,
} from './WorkflowContinuationStore.ts';

const scope = Object.freeze({ tenantId: 'agent-tenant', userId: 'agent-user', projectId: 'agent-project' });
const source = Object.freeze({
  artifactId: 'agent-source',
  kind: 'image',
  role: 'ORIGINAL',
  sha256: 'a'.repeat(64),
  parentArtifactIds: Object.freeze([]),
});

function create(parameters) {
  return normalizeWorkflowContinuationCreate({
    executionId: 'agent-workflow',
    clientRequestId: 'agent-request',
    scope,
    plan: {
      planId: 'bounded-agent-deterministic-v1',
      planRevision: '1',
      planDigest: 'b'.repeat(64),
      ...(parameters === undefined ? {} : { parameters }),
    },
    inputArtifacts: [source],
  });
}

test('workflow plan parameters normalize deterministically and empty legacy plans stay shape-compatible', () => {
  assert.equal(normalizeWorkflowPlanParameters(undefined), undefined);
  assert.equal(normalizeWorkflowPlanParameters({}), undefined);
  assert.deepEqual(create(undefined).plan, {
    planId: 'bounded-agent-deterministic-v1',
    planRevision: '1',
    planDigest: 'b'.repeat(64),
  });

  const normalized = create({ width: 640, mode: ' ROTATE_90_CW ', height: 480, preserveAlpha: true });
  assert.deepEqual(normalized.plan.parameters, {
    height: 480,
    mode: 'ROTATE_90_CW',
    preserveAlpha: true,
    width: 640,
  });
  assert.equal(Object.isFrozen(normalized.plan.parameters), true);
});

test('workflow plan replay equality includes immutable normalized parameters', () => {
  const left = create({ mode: 'ROTATE_90_CW', width: 640, height: 480 }).plan;
  const reordered = create({ height: 480, width: 640, mode: 'ROTATE_90_CW' }).plan;
  const differentGeometry = create({ mode: 'ROTATE_90_CW', width: 641, height: 480 }).plan;
  const differentMode = create({ mode: 'FLIP_HORIZONTAL', width: 640, height: 480 }).plan;
  assert.equal(samePlanBinding(left, reordered), true);
  assert.equal(samePlanBinding(left, differentGeometry), false);
  assert.equal(samePlanBinding(left, differentMode), false);
});

test('workflow plan parameters reject non-scalar, unsafe and oversized browser-shaped payloads', () => {
  assert.throws(() => normalizeWorkflowPlanParameters({ nested: { mode: 'ROTATE_90_CW' } }), /string, safe integer or boolean/);
  assert.throws(() => normalizeWorkflowPlanParameters({ list: ['ROTATE_90_CW'] }), /string, safe integer or boolean/);
  assert.throws(() => normalizeWorkflowPlanParameters({ width: 1.5 }), /safe integer/);
  assert.throws(() => normalizeWorkflowPlanParameters({ width: Number.MAX_SAFE_INTEGER + 1 }), /safe integer/);
  assert.throws(() => normalizeWorkflowPlanParameters({ ' bad ': 'x' }), /key is invalid/);
  assert.throws(() => normalizeWorkflowPlanParameters({ mode: 'x'.repeat(257) }), /accepted string contract/);
  assert.throws(() => normalizeWorkflowPlanParameters(Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`k${index}`, index]))), /16-field/);
});
