import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  canonicalTryOnManualRemediationPolicy,
  canonicalTryOnManualSaveTransition,
} from '../src/application/fashion/canonicalTryOnManualRemediationPolicy.js';

const PROJECT = 'aaaaaaaa-1111-4111-8111-111111111111';
const OUTFIT_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const ENTRY = 'cccccccc-3333-4333-8333-333333333333';
const GARMENT = 'dddddddd-4444-4444-8444-444444444444';
const SOURCE = 'current-source-artifact';

function selection({ category = 'shirts', entryId = ENTRY, garmentId = GARMENT, extra = null } = {}) {
  const value = {
    beforeUrl: '/api/core/artifacts/results/current.token',
    entryId,
    outfit: {
      id: OUTFIT_ID,
      revision: 7,
      entries: [
        { entryId: ENTRY, garmentId, garmentCategory: category, referenceReadiness: 'READY' },
      ],
    },
    projectId: PROJECT,
    sourceArtifactId: SOURCE,
  };
  return extra ? { ...value, ...extra } : value;
}

function result(status, options = {}) {
  const {
    entryId = ENTRY,
    garmentId = GARMENT,
    outerStatus = 'READINESS',
  } = options;
  const categoryGroup = Object.hasOwn(options, 'categoryGroup') ? options.categoryGroup : 'tops';
  return {
    status: outerStatus,
    readiness: {
      entryId,
      garmentId,
      status,
      ...(categoryGroup === undefined ? {} : { categoryGroup }),
    },
  };
}

test('representation required and ambiguous map only to explicit contour remediation', () => {
  for (const status of ['REPRESENTATION_REQUIRED', 'REPRESENTATION_AMBIGUOUS']) {
    const state = canonicalTryOnManualRemediationPolicy({ selection: selection(), result: result(status) });
    assert.equal(state.mode, 'CONTOUR');
    assert.equal(state.canOpen, true);
    assert.equal(state.ambiguous, status.endsWith('AMBIGUOUS'));
    assert.equal(state.requiresRecheckAfterSave, true);
    assert.deepEqual(state.contourRequest, { garmentId: GARMENT });
    assert.equal(state.bodyAnchorSource, null);
    assert.equal(state.categoryGroup, 'tops');
  }
});

test('body-anchor required and ambiguous bind the editor to the exact current project source', () => {
  for (const status of ['BODY_ANCHORS_REQUIRED', 'BODY_ANCHORS_AMBIGUOUS']) {
    const state = canonicalTryOnManualRemediationPolicy({ selection: selection(), result: result(status, { outerStatus: 'BLOCKED' }) });
    assert.equal(state.mode, 'BODY_ANCHORS');
    assert.equal(state.canOpen, true);
    assert.equal(state.ambiguous, status.endsWith('AMBIGUOUS'));
    assert.deepEqual(state.bodyAnchorSource, {
      projectId: PROJECT,
      sourceArtifactId: SOURCE,
      category: 'shirts',
      imageUrl: '/api/core/artifacts/results/current.token',
    });
    assert.equal(state.contourRequest, null);
  }
});

test('non-manual failures never authorize browser evidence creation', () => {
  for (const status of ['SOURCE_UNAVAILABLE', 'STALE_SOURCE', 'GARMENT_UNAVAILABLE', 'GARMENT_UNSUPPORTED', 'EVIDENCE_INVALID', 'READY']) {
    const categoryGroup = status === 'READY' ? 'tops' : status === 'GARMENT_UNSUPPORTED' ? 'accessories' : undefined;
    const state = canonicalTryOnManualRemediationPolicy({ selection: selection(), result: result(status, { categoryGroup }) });
    assert.equal(state.mode, 'NONE', status);
    assert.equal(state.canOpen, false, status);
    assert.equal(state.contourRequest, null, status);
    assert.equal(state.bodyAnchorSource, null, status);
  }
});

test('manual remediation requires exact selected entry/garment identity and supported group evidence', () => {
  assert.throws(
    () => canonicalTryOnManualRemediationPolicy({ selection: selection(), result: result('REPRESENTATION_REQUIRED', { entryId: 'eeeeeeee-5555-4555-8555-555555555555' }) }),
    /does not match the selected Outfit entry/,
  );
  assert.throws(
    () => canonicalTryOnManualRemediationPolicy({ selection: selection(), result: result('BODY_ANCHORS_REQUIRED', { garmentId: 'eeeeeeee-5555-4555-8555-555555555555' }) }),
    /does not match the selected Outfit entry/,
  );
  assert.throws(
    () => canonicalTryOnManualRemediationPolicy({ selection: selection(), result: result('REPRESENTATION_REQUIRED', { categoryGroup: undefined }) }),
    /requires the canonical supported category group/,
  );
  assert.throws(
    () => canonicalTryOnManualRemediationPolicy({ selection: selection(), result: result('BODY_ANCHORS_REQUIRED', { categoryGroup: 'accessories' }) }),
    /requires a supported category group/,
  );
});

test('body remediation refuses unsupported Wardrobe categories even if readiness drifts', () => {
  assert.throws(
    () => canonicalTryOnManualRemediationPolicy({ selection: selection({ category: 'hats' }), result: result('BODY_ANCHORS_REQUIRED') }),
    /unsupported Wardrobe category/,
  );
});

test('manual save acknowledgement always becomes recheck-required, never synthesized READY', () => {
  const open = canonicalTryOnManualRemediationPolicy({ selection: selection(), result: result('REPRESENTATION_REQUIRED') });
  const next = canonicalTryOnManualSaveTransition(open);
  assert.deepEqual(next, {
    mode: 'RECHECK_REQUIRED',
    canOpen: false,
    ambiguous: false,
    requiresRecheckAfterSave: true,
    readiness: null,
    contourRequest: null,
    bodyAnchorSource: null,
    categoryGroup: null,
    message: 'Manual evidence was saved. Check canonical readiness again before Run or another manual submission.',
  });
  assert.throws(() => canonicalTryOnManualSaveTransition({ mode: 'NONE', canOpen: false }), /requires an open remediation state/);
});

test('selection schema rejects authority-shaped extras and source drift', () => {
  assert.throws(
    () => canonicalTryOnManualRemediationPolicy({ selection: selection({ extra: { ticketId: 'nope' } }), result: result('REPRESENTATION_REQUIRED') }),
    /unknown or missing fields/,
  );
  assert.throws(
    () => canonicalTryOnManualRemediationPolicy({ selection: { ...selection(), sourceArtifactId: 'x'.repeat(513) }, result: result('BODY_ANCHORS_REQUIRED') }),
    /outside the accepted manual remediation contract/,
  );
});

test('policy is pure: no Core client, execution, persistence or hidden retry authority', async () => {
  const source = await readFile('src/application/fashion/canonicalTryOnManualRemediationPolicy.js', 'utf8');
  for (const forbidden of [
    'coreClient', 'fetch(', 'clientRequestId', 'ticketId', 'representationId', 'anchorSetId',
    'storageId', 'contentSha256', 'destinationMesh', 'localStorage', 'sessionStorage', 'indexedDB',
    '.begin(', '.resume(', '.recover(', '.retry(', 'pushEdit', 'finalizeAcceptedResult',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.match(source, /mode: 'RECHECK_REQUIRED'/);
  assert.match(source, /Manual browser remediation is not authorized/);
});
