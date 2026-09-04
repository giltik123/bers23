import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canonicalTryOnProductUiState } from '../src/application/fashion/canonicalTryOnProductUiState.js';

const ENTRY = 'entry-id';
const GARMENT = 'garment-id';
const host = (overrides = {}) => ({ active: true, busy: false, disposed: false, hasInFlight: false, phase: 'IDLE', ...overrides });
const readiness = (status, categoryGroup) => ({
  status: 'READINESS',
  readiness: {
    entryId: ENTRY,
    garmentId: GARMENT,
    status,
    ...(categoryGroup === undefined ? {} : { categoryGroup }),
  },
});

test('unchecked UI permits only explicit readiness inspection', () => {
  const ui = canonicalTryOnProductUiState({ host: host() });
  assert.equal(ui.status, 'UNCHECKED');
  assert.equal(ui.canInspect, true);
  assert.equal(ui.canRun, false);
  assert.equal(ui.canResume, false);
  assert.equal(ui.canRecover, false);
  assert.equal(ui.canAbandon, false);
});

test('Run is admitted only by explicit supported READY', () => {
  for (const categoryGroup of ['tops', 'bottoms', 'dresses', 'footwear']) {
    const ui = canonicalTryOnProductUiState({ result: readiness('READY', categoryGroup), host: host() });
    assert.equal(ui.canRun, true, categoryGroup);
    assert.equal(ui.canInspect, true);
    assert.match(ui.message, /prerequisites are ready/i);
  }

  assert.throws(
    () => canonicalTryOnProductUiState({ result: readiness('READY'), host: host() }),
    /requires a supported category group/,
  );
  assert.throws(
    () => canonicalTryOnProductUiState({ result: readiness('READY', 'accessories'), host: host() }),
    /requires a supported category group/,
  );
});

test('blocked readiness never exposes Run and retains manual-prerequisite messaging', () => {
  for (const status of [
    'SOURCE_UNAVAILABLE', 'STALE_SOURCE', 'GARMENT_UNAVAILABLE', 'GARMENT_UNSUPPORTED',
    'REPRESENTATION_REQUIRED', 'REPRESENTATION_AMBIGUOUS', 'BODY_ANCHORS_REQUIRED',
    'BODY_ANCHORS_AMBIGUOUS', 'EVIDENCE_INVALID',
  ]) {
    const categoryGroup = status === 'GARMENT_UNSUPPORTED' ? 'accessories' : undefined;
    const result = { ...readiness(status, categoryGroup), status: 'BLOCKED' };
    const ui = canonicalTryOnProductUiState({ result, host: host() });
    assert.equal(ui.canRun, false, status);
    assert.equal(ui.canResume, false, status);
    assert.equal(ui.canRecover, false, status);
  }

  assert.match(
    canonicalTryOnProductUiState({ result: { ...readiness('REPRESENTATION_REQUIRED'), status: 'BLOCKED' }, host: host() }).message,
    /manual garment outline/i,
  );
  assert.match(
    canonicalTryOnProductUiState({ result: { ...readiness('BODY_ANCHORS_REQUIRED'), status: 'BLOCKED' }, host: host() }).message,
    /manual project body anchors/i,
  );
});

test('continuation exposes Resume/Recover/Abandon only while an in-flight run exists', () => {
  for (const status of [
    'WARP_PENDING', 'TEXTURE_NOT_EXECUTED', 'TEXTURE_NOT_PREPARED',
    'TEXTURE_PENDING', 'TEXTURE_FAILED', 'TEXTURE_STALE',
  ]) {
    const ui = canonicalTryOnProductUiState({ result: { status }, host: host({ hasInFlight: true, phase: status }) });
    assert.equal(ui.canInspect, false, status);
    assert.equal(ui.canRun, false, status);
    assert.equal(ui.canResume, true, status);
    assert.equal(ui.canRecover, true, status);
    assert.equal(ui.canAbandon, true, status);
  }

  const staleDisplay = canonicalTryOnProductUiState({ result: { status: 'TEXTURE_PENDING' }, host: host({ hasInFlight: false }) });
  assert.equal(staleDisplay.canResume, false);
  assert.equal(staleDisplay.canRecover, false);
  assert.equal(staleDisplay.canAbandon, false);
});

test('busy or externally disabled UI blocks every mutating product action', () => {
  for (const flags of [{ busy: true }, { disabled: true }]) {
    const ui = canonicalTryOnProductUiState({
      result: { status: 'TEXTURE_PENDING' },
      host: host({ hasInFlight: true, phase: 'TEXTURE_PENDING' }),
      ...flags,
    });
    assert.equal(ui.canInspect, false);
    assert.equal(ui.canRun, false);
    assert.equal(ui.canResume, false);
    assert.equal(ui.canRecover, false);
    assert.equal(ui.canAbandon, false);
  }
});

test('UI policy rejects FINAL/pending-result and malformed host authority shapes', () => {
  assert.throws(
    () => canonicalTryOnProductUiState({ result: { status: 'FINAL_CANDIDATE' }, host: host() }),
    /unknown or non-displayable/,
  );
  assert.throws(
    () => canonicalTryOnProductUiState({ host: { ...host(), clientRequestId: 'forbidden' } }),
    /unknown or missing fields/,
  );
  assert.throws(
    () => canonicalTryOnProductUiState({ host: host({ disposed: true }) }),
    /disposed Editor host/,
  );
});

test('React controls contain no auto-run, retry, Core/provider or execution identity authority', async () => {
  const component = await readFile('src/components/editor/outfits/CanonicalTryOnProductControls.jsx', 'utf8');
  assert.doesNotMatch(component, /useEffect/);
  assert.doesNotMatch(component, /onRetry|\bRetry\b/);
  assert.match(component, /Check readiness/);
  assert.match(component, /> Run\s*</);
  assert.match(component, /> Resume\s*</);
  assert.match(component, /> Recover\s*</);
  assert.match(component, /> Abandon\s*</);
  assert.match(component, /!ui\.canRun/);
  for (const forbidden of [
    'coreClient', 'fetch(', 'clientRequestId', 'ticketId', 'representationId', 'anchorSetId', 'storageId',
    'contentSha256', 'destinationMesh', 'FASHN', 'Billing', 'credits_used', 'outfitManager', 'tryonEngine',
  ]) assert.equal(component.includes(forbidden), false, forbidden);
});
