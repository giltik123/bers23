import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanonicalTryOnReadinessSelection } from '../src/application/fashion/createCanonicalTryOnReadinessSelection.js';

const PROJECT = 'aaaaaaaa-1111-4111-8111-111111111111';
const GARMENT = 'bbbbbbbb-2222-4222-8222-222222222222';
const ENTRY = 'cccccccc-3333-4333-8333-333333333333';

function outfit(overrides = {}) {
  return {
    id: 'dddddddd-4444-4444-8444-444444444444',
    status: 'ACTIVE',
    entries: [{ entryId: ENTRY, garmentId: GARMENT, referenceReadiness: 'READY', layerRole: 'BASE_TOP' }],
    ...overrides,
  };
}

const intent = () => ({ outfit: outfit(), entryId: ENTRY, projectId: PROJECT, sourceArtifactId: 'source' });

test('selection delegates exactly one stable garment/source to canonical readiness only', async () => {
  const calls = [];
  const selection = createCanonicalTryOnReadinessSelection({
    checkReadiness: async (value) => {
      calls.push(value);
      return { status: 'READY', categoryGroup: 'tops' };
    },
  });
  const result = await selection.inspect({
    outfit: outfit(),
    entryId: ENTRY.toUpperCase(),
    projectId: PROJECT.toUpperCase(),
    sourceArtifactId: '  source-artifact  ',
  });
  assert.deepEqual(calls, [{ projectId: PROJECT, sourceArtifactId: 'source-artifact', garmentId: GARMENT }]);
  assert.deepEqual(result, { entryId: ENTRY, garmentId: GARMENT, status: 'READY', categoryGroup: 'tops' });
  const serialized = JSON.stringify(result);
  for (const forbidden of ['clientRequestId','ticketId','representationId','anchorSetId','layerId','revision']) assert.equal(serialized.includes(forbidden), false);
});

test('selection requires an ACTIVE Outfit and a canonically READY exact entry', async () => {
  const selection = createCanonicalTryOnReadinessSelection({ checkReadiness: async () => ({ status: 'READY', categoryGroup: 'tops' }) });
  await assert.rejects(() => selection.inspect({ outfit: outfit({ status: 'ARCHIVED' }), entryId: ENTRY, projectId: PROJECT, sourceArtifactId: 'source' }), /active canonical Outfit/);
  await assert.rejects(() => selection.inspect({ outfit: outfit({ entries: [{ entryId: ENTRY, garmentId: GARMENT, referenceReadiness: 'ROLE_REVIEW_REQUIRED' }] }), entryId: ENTRY, projectId: PROJECT, sourceArtifactId: 'source' }), /not canonically ready/);
  await assert.rejects(() => selection.inspect({ outfit: outfit(), entryId: 'eeeeeeee-5555-4555-8555-555555555555', projectId: PROJECT, sourceArtifactId: 'source' }), /exactly one canonical Outfit entry/);
  await assert.rejects(() => selection.inspect({ outfit: outfit({ entries: [...outfit().entries, ...outfit().entries] }), entryId: ENTRY, projectId: PROJECT, sourceArtifactId: 'source' }), /exactly one canonical Outfit entry/);
});

test('selection rejects malformed Outfit-entry, Project and source identity before Core call', async () => {
  let calls = 0;
  const selection = createCanonicalTryOnReadinessSelection({ checkReadiness: async () => { calls += 1; return { status: 'READY', categoryGroup: 'tops' }; } });
  await assert.rejects(() => selection.inspect({ outfit: outfit(), entryId: 'entry-1', projectId: PROJECT, sourceArtifactId: 'source' }), /entryId must be a UUID/);
  await assert.rejects(() => selection.inspect({ outfit: outfit(), entryId: ENTRY, projectId: 'bad', sourceArtifactId: 'source' }), /projectId must be a UUID/);
  await assert.rejects(() => selection.inspect({ outfit: outfit(), entryId: ENTRY, projectId: PROJECT, sourceArtifactId: 'x'.repeat(513) }), /outside the accepted Try-On contract/);
  assert.equal(calls, 0);
});

test('selection renders the closed canonical readiness vocabulary', async () => {
  const ready = createCanonicalTryOnReadinessSelection({ checkReadiness: async () => ({ status: 'READY', categoryGroup: 'tops' }) });
  assert.equal((await ready.inspect(intent())).status, 'READY');

  for (const status of [
    'SOURCE_UNAVAILABLE', 'STALE_SOURCE', 'GARMENT_UNAVAILABLE', 'GARMENT_UNSUPPORTED',
    'REPRESENTATION_REQUIRED', 'REPRESENTATION_AMBIGUOUS', 'BODY_ANCHORS_REQUIRED',
    'BODY_ANCHORS_AMBIGUOUS', 'EVIDENCE_INVALID',
  ]) {
    const selection = createCanonicalTryOnReadinessSelection({ checkReadiness: async () => ({ status }) });
    assert.equal((await selection.inspect(intent())).status, status);
  }
  const invalid = createCanonicalTryOnReadinessSelection({ checkReadiness: async () => ({ status: 'FALLBACK_TO_CLOUD' }) });
  await assert.rejects(() => invalid.inspect(intent()), /Unknown Try-On readiness status/);
});

test('READY requires a server-supported deterministic category group', async () => {
  for (const response of [
    { status: 'READY' },
    { status: 'READY', categoryGroup: 'accessories' },
    { status: 'READY', categoryGroup: 'other' },
  ]) {
    const selection = createCanonicalTryOnReadinessSelection({ checkReadiness: async () => response });
    await assert.rejects(() => selection.inspect(intent()), /READY requires a supported category group/);
  }
  for (const categoryGroup of ['tops', 'bottoms', 'dresses', 'footwear']) {
    const selection = createCanonicalTryOnReadinessSelection({ checkReadiness: async () => ({ status: 'READY', categoryGroup }) });
    assert.equal((await selection.inspect(intent())).categoryGroup, categoryGroup);
  }
});

test('failure readiness may retain known unsupported group for actionable diagnostics', async () => {
  const selection = createCanonicalTryOnReadinessSelection({
    checkReadiness: async () => ({ status: 'GARMENT_UNSUPPORTED', categoryGroup: 'accessories' }),
  });
  assert.deepEqual(await selection.inspect(intent()), {
    entryId: ENTRY,
    garmentId: GARMENT,
    status: 'GARMENT_UNSUPPORTED',
    categoryGroup: 'accessories',
  });
});

test('readiness response cannot smuggle execution or billing authority', async () => {
  const selection = createCanonicalTryOnReadinessSelection({
    checkReadiness: async () => ({ status: 'READY', categoryGroup: 'tops', ticketId: 'forbidden' }),
  });
  await assert.rejects(() => selection.inspect(intent()), /unknown or missing fields/);
});
