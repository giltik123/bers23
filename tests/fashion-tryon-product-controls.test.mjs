import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canonicalTryOnProductUiState } from '../src/application/fashion/canonicalTryOnProductUiState.js';

const ENTRY = 'entry-id';
const GARMENT = 'garment-id';
const TRY_ON_I18N_KEYS = [
  'controlsLabel', 'deterministicTryOn', 'close', 'checkReadiness', 'run', 'resume', 'recover', 'abandon',
  'readinessRunDisabled', 'tryOnUnchecked', 'tryOnUncertain', 'tryOnReady', 'tryOnSourceUnavailable',
  'tryOnStaleSource', 'tryOnGarmentUnavailable', 'tryOnGarmentUnsupported', 'tryOnRepresentationRequired',
  'tryOnRepresentationAmbiguous', 'tryOnBodyAnchorsRequired', 'tryOnBodyAnchorsAmbiguous',
  'tryOnEvidenceInvalid', 'tryOnWarpPending', 'tryOnTextureNotExecuted', 'tryOnTextureNotPrepared',
  'tryOnTexturePending', 'tryOnTextureFailed', 'tryOnTextureStale',
];
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

test('ambiguous transport outcome is projected from host UNCERTAIN and exposes only explicit reconciliation', () => {
  const ui = canonicalTryOnProductUiState({
    result: readiness('READY', 'tops'),
    host: host({ hasInFlight: true, phase: 'UNCERTAIN' }),
  });
  assert.equal(ui.status, 'UNCERTAIN');
  assert.match(ui.message, /outcome is uncertain/i);
  assert.match(ui.message, /no automatic retry/i);
  assert.equal(ui.canInspect, false);
  assert.equal(ui.canRun, false);
  assert.equal(ui.canResume, true);
  assert.equal(ui.canRecover, true);
  assert.equal(ui.canAbandon, true);
  assert.equal(ui.hasInFlight, true);

  assert.throws(
    () => canonicalTryOnProductUiState({ result: readiness('READY', 'tops'), host: host({ phase: 'UNCERTAIN' }) }),
    /requires an in-flight product identity/,
  );
});

test('busy or externally disabled UI blocks every mutating product action including UNCERTAIN reconciliation', () => {
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

    const uncertain = canonicalTryOnProductUiState({
      result: readiness('READY', 'tops'),
      host: host({ hasInFlight: true, phase: 'UNCERTAIN' }),
      ...flags,
    });
    assert.equal(uncertain.canResume, false);
    assert.equal(uncertain.canRecover, false);
    assert.equal(uncertain.canAbandon, false);
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
  assert.match(component, /t\('fashionUi\.checkReadiness'\)/);
  assert.match(component, /t\('fashionUi\.run'\)/);
  assert.match(component, /t\('fashionUi\.resume'\)/);
  assert.match(component, /t\('fashionUi\.recover'\)/);
  assert.match(component, /t\('fashionUi\.abandon'\)/);
  assert.match(component, /!ui\.canRun/);
  for (const forbidden of [
    'coreClient', 'fetch(', 'clientRequestId', 'ticketId', 'representationId', 'anchorSetId', 'storageId',
    'contentSha256', 'destinationMesh', 'FASHN', 'Billing', 'credits_used', 'outfitManager', 'tryonEngine',
  ]) assert.equal(component.includes(forbidden), false, forbidden);
});

test('canonical Try-On control copy is complete in both English and Russian without changing action policy', async () => {
  const [englishSource, russianSource, component] = await Promise.all([
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
    readFile('src/components/editor/outfits/CanonicalTryOnProductControls.jsx', 'utf8'),
  ]);
  const extractFashionUi = (source) => {
    const marker = source.indexOf('fashionUi: {');
    assert.notEqual(marker, -1, 'fashionUi catalog exists');
    const start = source.indexOf('{', marker);
    let depth = 0;
    let quote = null;
    let escaped = false;
    let end = -1;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character;
        continue;
      }
      if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) { end = index; break; }
      }
    }
    assert.notEqual(end, -1, 'fashionUi catalog closes');
    return JSON.parse(source.slice(start, end + 1));
  };
  const english = extractFashionUi(englishSource);
  const russian = extractFashionUi(russianSource);
  for (const key of TRY_ON_I18N_KEYS) {
    assert.equal(typeof english[key], 'string', `English fashionUi.${key}`);
    assert.equal(typeof russian[key], 'string', `Russian fashionUi.${key}`);
    assert.ok(english[key].trim().length > 0, `English fashionUi.${key} is non-empty`);
    assert.ok(russian[key].trim().length > 0, `Russian fashionUi.${key} is non-empty`);
  }
  for (const key of TRY_ON_I18N_KEYS) {
    assert.ok(component.includes(`fashionUi.${key}`) || component.includes(`'${key}'`), `control maps or renders fashionUi.${key}`);
  }
  assert.match(component, /t\(tryOnMessageKey\(ui\)\)/);
  assert.doesNotMatch(component, /Check readiness|Run remains disabled|> Run\s*</);
});
