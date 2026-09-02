import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FASHION_TRYON_MAX_CLIENT_REQUEST_ID_LENGTH,
  FASHION_TRYON_ORCHESTRATION_VERSION,
  FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_CANONICAL_JSON_V1,
  FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_V1,
  fashionTryOnPhaseRequestIds,
  normalizeFashionTryOnOrchestrationIntent,
} from '../server/core/fashion/FashionTryOnOrchestrationContract.ts';
import { normalizeGarmentTextureCompositeProducerParameters } from '../src/platform/creative/deterministic/GarmentTextureCompositeParameters.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const sourceArtifactId = 'signed-current-project-image';

const expectedDefaultsJson = '{"schema":"BERS_GARMENT_TEXTURE_COMPOSITE_Q16_V1","textureTransform":{"scaleXQ16":65536,"scaleYQ16":65536,"offsetXQ16":0,"offsetYQ16":0,"wrapMode":"CLAMP","alphaPolicy":"PRESERVE_BASE_ALPHA"},"featherRadius":2,"colorSpacePolicy":"SRGB_GAMMA_ENCODED_RGBA8"}';

test('F4b.6b.1 normalizes stable one-garment intent and has exact phase request vectors', () => {
  assert.equal(FASHION_TRYON_ORCHESTRATION_VERSION, '1');
  const intent = normalizeFashionTryOnOrchestrationIntent({
    projectId: projectId.toUpperCase(),
    sourceArtifactId: `  ${sourceArtifactId}  `,
    garmentId: garmentId.toUpperCase(),
    clientRequestId: 'tryon-request-001',
  });
  assert.deepEqual(intent, { projectId, sourceArtifactId, garmentId, clientRequestId: 'tryon-request-001' });
  assert.deepEqual(fashionTryOnPhaseRequestIds(intent.clientRequestId), {
    garmentWarp: 'tryon-request-001:garment-warp:v1',
    textureComposite: 'tryon-request-001:texture-composite:v1',
  });
});

test('F4b.6b.1 rejects evidence identities and any unknown client authority', () => {
  const base = { projectId, sourceArtifactId, garmentId, clientRequestId: 'tryon-request-002' };
  for (const extra of [
    { representationId: '33333333-3333-4333-8333-333333333333' },
    { anchorSetId: '44444444-4444-4444-8444-444444444444' },
    { garmentWarpLayerId: '55555555-5555-4555-8555-555555555555' },
    { garmentWarpLayerSha256: 'a'.repeat(64) },
    { garments: [garmentId] },
  ]) {
    assert.throws(
      () => normalizeFashionTryOnOrchestrationIntent({ ...base, ...extra }),
      (cause: any) => cause?.status === 400 && cause?.code === 'forbidden_client_authority',
    );
  }
});

test('F4b.6b.1 maximum orchestration request ID leaves exact space for existing 200-char local IDs', () => {
  const maximum = `a${'b'.repeat(FASHION_TRYON_MAX_CLIENT_REQUEST_ID_LENGTH - 1)}`;
  const ids = fashionTryOnPhaseRequestIds(maximum);
  assert.equal(maximum.length, 179);
  assert.equal(ids.garmentWarp.length, 195);
  assert.equal(ids.textureComposite.length, 200);
  assert.match(ids.garmentWarp, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
  assert.match(ids.textureComposite, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
  assert.throws(
    () => fashionTryOnPhaseRequestIds(`${maximum}x`),
    (cause: any) => cause?.status === 400 && cause?.code === 'fashion_tryon_orchestration_invalid_request',
  );
});

test('F4b.6b.1 composite defaults are the exact accepted closed F4b.5 producer document', () => {
  assert.equal(FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_CANONICAL_JSON_V1, expectedDefaultsJson);
  assert.deepEqual(FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_V1, {
    schema: 'BERS_GARMENT_TEXTURE_COMPOSITE_Q16_V1',
    textureTransform: {
      scaleXQ16: 65_536,
      scaleYQ16: 65_536,
      offsetXQ16: 0,
      offsetYQ16: 0,
      wrapMode: 'CLAMP',
      alphaPolicy: 'PRESERVE_BASE_ALPHA',
    },
    featherRadius: 2,
    colorSpacePolicy: 'SRGB_GAMMA_ENCODED_RGBA8',
  });
  const independentlyNormalized = normalizeGarmentTextureCompositeProducerParameters(FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_V1);
  assert.equal(independentlyNormalized.canonicalJson, expectedDefaultsJson);
});

test('F4b.6b.1 invalid identifiers fail before any orchestration layer can resolve evidence', () => {
  for (const candidate of [
    { projectId: 'not-a-uuid', sourceArtifactId, garmentId, clientRequestId: 'valid' },
    { projectId, sourceArtifactId: ' ', garmentId, clientRequestId: 'valid' },
    { projectId, sourceArtifactId, garmentId: 'not-a-uuid', clientRequestId: 'valid' },
    { projectId, sourceArtifactId, garmentId, clientRequestId: 'has space' },
  ]) {
    assert.throws(
      () => normalizeFashionTryOnOrchestrationIntent(candidate),
      (cause: any) => cause?.status === 400 && cause?.code === 'fashion_tryon_orchestration_invalid_request',
    );
  }
});
