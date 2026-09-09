import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTEXT_GRAPH_V1_SCHEMA,
  ContextGraphV1Error,
  contextGraphV1Digest,
  normalizeContextGraphEphemeralV1,
  normalizeContextGraphV1,
  serializeContextGraphV1,
} from './ContextGraphV1.ts';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const ORIGINAL = '22222222-2222-4222-8222-222222222222';
const CURRENT = '33333333-3333-4333-8333-333333333333';
const CURSOR = '44444444-4444-4444-8444-444444444444';
const HISTORY0 = '55555555-5555-4555-8555-555555555555';
const GARMENT_A = '66666666-6666-4666-8666-666666666666';
const GARMENT_B = '77777777-7777-4777-8777-777777777777';
const VIEW_A = '88888888-8888-4888-8888-888888888888';
const VIEW_B = '99999999-9999-4999-8999-999999999999';
const OUTFIT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENTRY_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ENTRY_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function graph() {
  return {
    schemaVersion: CONTEXT_GRAPH_V1_SCHEMA,
    project: {
      projectId: PROJECT,
      historyCursorId: CURSOR,
      cursorOrdinal: 1,
      originalSourceStorageId: ORIGINAL,
      currentSourceStorageId: CURRENT,
      width: 1024,
      height: 768,
    },
    currentSource: {
      storageId: CURRENT,
      role: 'COMPOSITE',
      lifecycle: 'FINAL',
      width: 1024,
      height: 768,
      executionId: 'execution-1',
      operationId: 'operation-1',
      sourceStorageId: ORIGINAL,
      producerOperation: 'ORTHOGONAL_TRANSFORM',
    },
    history: [
      { historyId: CURSOR, ordinal: 1, imageStorageId: CURRENT, sourceStorageId: ORIGINAL, kind: 'ACCEPTED_FINAL' },
      { historyId: HISTORY0, ordinal: 0, imageStorageId: ORIGINAL, sourceStorageId: ORIGINAL, kind: 'ORIGINAL' },
    ],
    candidates: [
      { storageId: CURRENT, width: 1024, height: 768, isCurrent: true, executionId: 'execution-1', operationId: 'operation-1', sourceStorageId: ORIGINAL, producerOperation: 'ORTHOGONAL_TRANSFORM' },
    ],
    garments: [
      { garmentId: GARMENT_B, revision: 2, status: 'ACTIVE', representationTier: 'PARAMETRIC', primaryViewId: VIEW_B, primaryViewSha256: SHA_B },
      { garmentId: GARMENT_A, revision: 1, status: 'ACTIVE', representationTier: 'BASIC', primaryViewId: VIEW_A, primaryViewSha256: SHA_A },
    ],
    outfits: [
      { outfitId: OUTFIT, revision: 3, status: 'ACTIVE', entries: [
        { entryId: ENTRY_B, garmentId: GARMENT_B, garmentReferenceState: 'GROUNDED', position: 1, layerRole: 'OUTER_TOP' },
        { entryId: ENTRY_A, garmentId: GARMENT_A, garmentReferenceState: 'GROUNDED', position: 0, layerRole: 'BASE_TOP' },
      ] },
    ],
    ephemeral: [
      { kind: 'SELECTED_OBJECT', id: 'object-2', projectId: PROJECT, sourceStorageId: CURRENT, uiRevision: 'editor/9' },
      { kind: 'PERSON', id: 'person-1', projectId: PROJECT, sourceStorageId: CURRENT, uiRevision: 'editor/9' },
    ],
  };
}

test('ContextGraphV1 canonicalizes set-like references and yields stable domain-separated digest', () => {
  const first = normalizeContextGraphV1(graph());
  const secondRaw = structuredClone(graph());
  secondRaw.garments.reverse();
  secondRaw.history.reverse();
  secondRaw.outfits[0].entries.reverse();
  secondRaw.ephemeral.reverse();
  const second = normalizeContextGraphV1(secondRaw);

  assert.equal(serializeContextGraphV1(first), serializeContextGraphV1(second));
  assert.equal(contextGraphV1Digest(first), contextGraphV1Digest(second));
  assert.match(contextGraphV1Digest(first), /^[0-9a-f]{64}$/u);
  assert.deepEqual(first.garments.map(item => item.garmentId), [GARMENT_A, GARMENT_B]);
  assert.deepEqual(first.outfits[0].entries.map(item => item.position), [0, 1]);
  assert.deepEqual(first.outfits[0].entries.map(item => item.garmentReferenceState), ['GROUNDED', 'GROUNDED']);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.outfits[0].entries), true);
});

test('canonical reference changes change the graph digest', () => {
  const baseline = normalizeContextGraphV1(graph());
  const changed = structuredClone(graph());
  changed.garments[0].revision += 1;
  assert.notEqual(contextGraphV1Digest(baseline), contextGraphV1Digest(normalizeContextGraphV1(changed)));
});

test('ContextGraphV1 refuses stale/cross-project ephemeral context', () => {
  const stale = structuredClone(graph());
  stale.ephemeral[0].sourceStorageId = ORIGINAL;
  assert.throws(() => normalizeContextGraphV1(stale), (error) => error instanceof ContextGraphV1Error && error.code === 'context_graph_ephemeral_stale_source');

  const cross = structuredClone(graph());
  cross.ephemeral[0].projectId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  assert.throws(() => normalizeContextGraphV1(cross), (error) => error instanceof ContextGraphV1Error && error.code === 'context_graph_ephemeral_cross_project');
});

test('ephemeral input is exact-schema and cannot smuggle authority fields', () => {
  const safe = graph().ephemeral;
  assert.equal(normalizeContextGraphEphemeralV1(safe).length, 2);
  for (const key of ['provider', 'modelId', 'billing', 'credits', 'executionId', 'artifactId', 'projectRevision']) {
    const injected = [{ ...safe[0], [key]: 'forbidden' }];
    assert.throws(() => normalizeContextGraphEphemeralV1(injected), (error) => error instanceof ContextGraphV1Error && error.code === 'context_graph_exact_schema_violation');
  }
});

test('Project cursor/current source/geometry inconsistencies fail closed', () => {
  const cursorMismatch = structuredClone(graph());
  cursorMismatch.project.historyCursorId = HISTORY0;
  assert.throws(() => normalizeContextGraphV1(cursorMismatch), /cursor/i);

  const sourceMismatch = structuredClone(graph());
  sourceMismatch.project.currentSourceStorageId = ORIGINAL;
  assert.throws(() => normalizeContextGraphV1(sourceMismatch), /current source/i);

  const geometryMismatch = structuredClone(graph());
  geometryMismatch.project.width = 512;
  assert.throws(() => normalizeContextGraphV1(geometryMismatch), /geometry/i);
});

test('Outfit reference states preserve exact same-graph grounding semantics', () => {
  const danglingGrounded = structuredClone(graph());
  danglingGrounded.garments = danglingGrounded.garments.filter(garment => garment.garmentId !== GARMENT_B);
  assert.throws(
    () => normalizeContextGraphV1(danglingGrounded),
    (error) => error instanceof ContextGraphV1Error && error.code === 'context_graph_outfit_garment_unresolved',
  );

  const unavailable = structuredClone(graph());
  unavailable.garments = unavailable.garments.filter(garment => garment.garmentId !== GARMENT_B);
  unavailable.outfits[0].entries.find(entry => entry.garmentId === GARMENT_B).garmentReferenceState = 'UNAVAILABLE';
  const unavailableNormalized = normalizeContextGraphV1(unavailable);
  assert.equal(unavailableNormalized.outfits[0].entries[1].garmentReferenceState, 'UNAVAILABLE');

  const outside = structuredClone(unavailable);
  outside.outfits[0].entries.find(entry => entry.garmentId === GARMENT_B).garmentReferenceState = 'OUTSIDE_BOUNDED_WINDOW';
  const outsideNormalized = normalizeContextGraphV1(outside);
  assert.equal(outsideNormalized.outfits[0].entries[1].garmentReferenceState, 'OUTSIDE_BOUNDED_WINDOW');
  assert.notEqual(contextGraphV1Digest(unavailableNormalized), contextGraphV1Digest(outsideNormalized));

  const conflict = structuredClone(graph());
  conflict.outfits[0].entries.find(entry => entry.garmentId === GARMENT_B).garmentReferenceState = 'UNAVAILABLE';
  assert.throws(
    () => normalizeContextGraphV1(conflict),
    (error) => error instanceof ContextGraphV1Error && error.code === 'context_graph_outfit_garment_state_conflict',
  );
});

test('Outfit entry identity, garment uniqueness and dense positions remain canonical invariants', () => {
  const duplicateGarment = structuredClone(graph());
  duplicateGarment.outfits[0].entries[1].garmentId = GARMENT_B;
  assert.throws(
    () => normalizeContextGraphV1(duplicateGarment),
    (error) => error instanceof ContextGraphV1Error && error.code === 'context_graph_outfit_garment_duplicate',
  );

  const sparse = structuredClone(graph());
  sparse.outfits[0].entries[1].position = 2;
  assert.throws(
    () => normalizeContextGraphV1(sparse),
    (error) => error instanceof ContextGraphV1Error && error.code === 'context_graph_outfit_positions_not_dense',
  );
});

test('ContextGraphV1 is advisory data and contains no arbitrary root/nested widening', () => {
  const root = { ...graph(), providerSelector: 'forbidden' };
  assert.throws(() => normalizeContextGraphV1(root), (error) => error instanceof ContextGraphV1Error && error.code === 'context_graph_exact_schema_violation');

  const garment = structuredClone(graph());
  garment.garments[0].uri = 'https://example.invalid/model';
  assert.throws(() => normalizeContextGraphV1(garment), (error) => error instanceof ContextGraphV1Error && error.code === 'context_graph_exact_schema_violation');
});
