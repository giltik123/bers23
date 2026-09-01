import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GARMENT_APPEARANCE_REFINEMENT_PRODUCER_PARAMETERS_V1,
  normalizeGarmentAppearanceRefinementProducerParameters,
} from '../src/platform/creative/deterministic/GarmentAppearanceRefinementParameters.ts';
import { normalizeGarmentAppearanceRefinementLineageParameters } from '../server/core/fashion/garmentAppearanceRefinementLineage.ts';

const expectedCanonicalJson = '{"schema":"BERS_GARMENT_APPEARANCE_REFINEMENT_PRODUCER_V1","profile":"REFINE_REALISM_V1","support":{"supportSource":"GARMENT_WARP_ALPHA_NONZERO","dilationPolicy":"CHEBYSHEV_SQUARE_CLIPPED","dilationRadiusPx":2,"maskPolicy":"BINARY_R8_0_OR_255","outsideSupportPolicy":"BYTE_EXACT_PARENT_RGBA8_OUTSIDE_SUPPORT","alphaPolicy":"PRESERVE_PARENT_ALPHA_GLOBAL"}}';
const expectedSha256 = 'e12f9db090851cb15d70ea747b6945df832d57510d1d6c48a779594a46ed758d';

function cloneDocument(): any {
  return JSON.parse(JSON.stringify(GARMENT_APPEARANCE_REFINEMENT_PRODUCER_PARAMETERS_V1.document));
}

test('F5a.2 producer document has one exact canonical JSON and Core SHA-256 vector', () => {
  const normalized = normalizeGarmentAppearanceRefinementProducerParameters(cloneDocument());
  assert.equal(normalized.canonicalJson, expectedCanonicalJson);
  assert.deepEqual(normalized.document, GARMENT_APPEARANCE_REFINEMENT_PRODUCER_PARAMETERS_V1.document);
  assert.equal(Object.isFrozen(normalized.document), true);
  assert.equal(Object.isFrozen(normalized.document.support), true);

  const core = normalizeGarmentAppearanceRefinementLineageParameters(cloneDocument());
  assert.equal(core.canonicalJson, expectedCanonicalJson);
  assert.equal(core.sha256, expectedSha256);
  assert.match(core.sha256, /^[0-9a-f]{64}$/);
});

test('F5a.2 producer contract rejects model prompt provider and execution authority fields', () => {
  for (const [field, value] of [
    ['modelId', 'some-model'],
    ['prompt', 'make it realistic'],
    ['negativePrompt', 'bad'],
    ['seed', 42],
    ['steps', 20],
    ['provider', 'cloud'],
    ['mask', [255]],
    ['executionId', 'browser-execution'],
  ] as const) {
    const document = cloneDocument();
    document[field] = value;
    assert.throws(
      () => normalizeGarmentAppearanceRefinementProducerParameters(document),
      /unknown or missing fields/i,
      `${field} must not enter canonical F5 producer lineage`,
    );
  }
});

test('F5a.2 producer support contract is exact and cannot widen deterministic support', () => {
  for (const [field, value] of [
    ['supportSource', 'MODEL_MASK'],
    ['dilationPolicy', 'ADAPTIVE'],
    ['dilationRadiusPx', 3],
    ['maskPolicy', 'FLOAT32'],
    ['outsideSupportPolicy', 'ALLOW_SMALL_ERROR'],
    ['alphaPolicy', 'ALLOW_ALPHA_CHANGE'],
  ] as const) {
    const document = cloneDocument();
    document.support[field] = value;
    assert.throws(
      () => normalizeGarmentAppearanceRefinementProducerParameters(document),
      new RegExp(field, 'i'),
      `${field} must remain the closed F5a.1 value`,
    );
  }

  const extra = cloneDocument();
  extra.support.haloRadius = 8;
  assert.throws(
    () => normalizeGarmentAppearanceRefinementProducerParameters(extra),
    /unknown or missing fields/i,
  );
});

test('F5a.2 rejects missing and malformed producer documents before durable hashing', () => {
  for (const value of [null, [], {}, { schema: 'BERS_GARMENT_APPEARANCE_REFINEMENT_PRODUCER_V1' }]) {
    assert.throws(() => normalizeGarmentAppearanceRefinementLineageParameters(value), Error);
  }
});
