import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CORE_PREVIEW_URL = /^\/api\/core\/artifacts\/results\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Convert an already-normalized canonical Try-On FINAL result into the Editor's
 * existing pending-result shape without granting the Fashion panel any Project
 * mutation authority.
 *
 * Local PixelImage previews are materialized as owned blob URLs. Recovery
 * previews remain short-lived Core delivery URLs; they are never converted
 * into durable Project identity and Editor disposal will not revoke them.
 */
export async function materializeCanonicalTryOnEditorPendingResult(
  { result, beforeUrl, garmentId, sourceArtifactId, garmentLabel },
  {
    encodePng = encodeDeterministicRgbaPng,
    createObjectUrl = defaultCreateObjectUrl,
  } = {},
) {
  requirePlainObject(result, 'Canonical Try-On result');
  if (result.status !== 'FINAL_READY') throw new Error('Editor handoff requires canonical Try-On FINAL_READY');
  const artifactId = nonEmptyString(result.artifactId, 'Canonical Try-On FINAL artifact identity');
  const stableGarmentId = lowerUuid(garmentId, 'garmentId');
  const stableSourceArtifactId = nonEmptyString(sourceArtifactId, 'sourceArtifactId');
  const stableBeforeUrl = nonEmptyString(beforeUrl, 'beforeUrl');
  const label = nonEmptyString(garmentLabel, 'garmentLabel');

  let previewUrl;
  if (typeof result.preview === 'string') {
    if (!CORE_PREVIEW_URL.test(result.preview)) throw new Error('Try-On recovery preview URL is outside the Editor handoff contract');
    if (!Number.isSafeInteger(result.previewExpiresAt) || result.previewExpiresAt <= 0) {
      throw new Error('Try-On recovery preview expiry is outside the Editor handoff contract');
    }
    previewUrl = result.preview;
  } else {
    const pixels = requirePixelImage(result.preview);
    const bytes = await encodePng(pixels);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error('Try-On local preview PNG encoder returned invalid bytes');
    previewUrl = nonEmptyString(createObjectUrl(bytes), 'Try-On local preview object URL');
    if (!previewUrl.startsWith('blob:')) throw new Error('Try-On local preview must materialize as an owned blob URL');
  }

  return Object.freeze({
    kind: 'FASHION_TRY_ON',
    result: Object.freeze({
      finalArtifactId: artifactId,
      preview_url: previewUrl,
      image_url: previewUrl,
      provider: 'Local deterministic Try-On',
      credits_used: 0,
      generation_time_ms: 0,
    }),
    instruction: `Try on ${label}`,
    beforeUrl: stableBeforeUrl,
    context: Object.freeze({
      garmentId: stableGarmentId,
      sourceArtifactId: stableSourceArtifactId,
    }),
  });
}

function requirePixelImage(value) {
  requirePlainObject(value, 'Try-On local preview');
  const expected = ['colorSpace', 'data', 'format', 'height', 'orientation', 'width'];
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Try-On local preview has unknown or missing fields');
  }
  if (!Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width < 1 || value.height < 1) {
    throw new Error('Try-On local preview geometry is invalid');
  }
  if (value.format !== 'RGBA8' || value.orientation !== 1 || value.colorSpace !== 'srgb') {
    throw new Error('Try-On local preview pixel contract is invalid');
  }
  if (!(value.data instanceof Uint8ClampedArray) || value.data.length !== value.width * value.height * 4) {
    throw new Error('Try-On local preview RGBA payload is invalid');
  }
  return value;
}

function defaultCreateObjectUrl(bytes) {
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
}

function lowerUuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} must be a lowercase UUID`);
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new TypeError(`${label} is invalid`);
  return normalized;
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}
