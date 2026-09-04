const GARMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOVERY_PREVIEW_URL = /^\/api\/core\/artifacts\/results\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Converts one canonical deterministic Try-On FINAL into the existing Editor
 * pending-result shape without granting Project mutation authority.
 *
 * Local PixelImage previews are encoded through the already-admitted
 * deterministic PNG codec injected by Editor and become Editor-owned blob:
 * URLs. Recovery previews remain the short-lived Core delivery capability
 * already validated by the canonical application. Blob revocation remains the
 * existing Editor pending-result lifecycle responsibility.
 */
export function createTryOnEditorFinalHandoff({ encodePreviewPng, createBlobUrl }) {
  requireFunction(encodePreviewPng, 'encodePreviewPng');
  requireFunction(createBlobUrl, 'createBlobUrl');

  return async function handoff(value) {
    requirePlainObject(value, 'Try-On Editor handoff');
    requireExactKeys(value, ['beforeUrl', 'final', 'garmentId', 'sourceArtifactId'], 'Try-On Editor handoff');

    const garmentId = normalizeGarmentId(value.garmentId);
    const sourceArtifactId = normalizeSourceArtifactId(value.sourceArtifactId);
    const beforeUrl = requireString(value.beforeUrl, 'beforeUrl');
    const final = normalizeFinal(value.final);

    let previewUrl;
    if (typeof final.preview === 'string') {
      if (!RECOVERY_PREVIEW_URL.test(final.preview)) {
        throw new Error('Try-On recovery preview is outside the accepted Editor delivery contract');
      }
      previewUrl = final.preview;
    } else {
      const png = await encodePreviewPng(final.preview);
      if (!(png instanceof Uint8Array) || png.byteLength === 0) {
        throw new Error('Try-On deterministic preview encoder returned invalid PNG bytes');
      }
      previewUrl = await createBlobUrl(png);
      if (typeof previewUrl !== 'string' || !previewUrl.startsWith('blob:')) {
        throw new Error('Try-On local preview must use an Editor-owned blob URL');
      }
    }

    return Object.freeze({
      kind: 'FASHION_TRYON',
      result: Object.freeze({
        finalArtifactId: final.artifactId,
        preview_url: previewUrl,
        image_url: previewUrl,
        provider: 'Local deterministic',
        credits_used: 0,
      }),
      instruction: 'Try on garment',
      beforeUrl,
      context: Object.freeze({ garmentId, sourceArtifactId }),
    });
  };
}

function normalizeFinal(value) {
  requirePlainObject(value, 'Try-On FINAL');
  const keys = Object.keys(value).sort();
  const localKeys = ['artifactId', 'preview', 'status'];
  const recoveryKeys = ['artifactId', 'preview', 'previewExpiresAt', 'status'];
  if (!sameKeys(keys, localKeys) && !sameKeys(keys, recoveryKeys)) {
    throw new Error('Try-On FINAL has unknown or missing fields');
  }
  if (value.status !== 'FINAL_READY') throw new Error('Try-On Editor handoff requires FINAL_READY');
  const artifactId = requireString(value.artifactId, 'artifactId');
  if (typeof value.preview === 'string') {
    if (!sameKeys(keys, recoveryKeys)) throw new Error('Recovered Try-On preview requires expiry evidence');
    if (!Number.isSafeInteger(value.previewExpiresAt) || value.previewExpiresAt <= 0) {
      throw new Error('Recovered Try-On preview expiry is invalid');
    }
    return Object.freeze({ status: 'FINAL_READY', artifactId, preview: value.preview, previewExpiresAt: value.previewExpiresAt });
  }
  if (!sameKeys(keys, localKeys)) throw new Error('Local Try-On preview must not claim recovery expiry evidence');
  requirePixelImage(value.preview);
  return Object.freeze({ status: 'FINAL_READY', artifactId, preview: value.preview });
}

function requirePixelImage(value) {
  requirePlainObject(value, 'Try-On local preview');
  requireExactKeys(value, ['colorSpace', 'data', 'format', 'height', 'orientation', 'width'], 'Try-On local preview');
  if (!Number.isSafeInteger(value.width) || value.width < 1 || !Number.isSafeInteger(value.height) || value.height < 1) {
    throw new Error('Try-On local preview geometry is invalid');
  }
  const expectedBytes = value.width * value.height * 4;
  if (!Number.isSafeInteger(expectedBytes)
    || !(value.data instanceof Uint8ClampedArray)
    || value.data.length !== expectedBytes) {
    throw new Error('Try-On local preview RGBA bytes are invalid');
  }
  if (value.format !== 'RGBA8' || value.orientation !== 1 || value.colorSpace !== 'srgb') {
    throw new Error('Try-On local preview pixel contract is invalid');
  }
}

function normalizeGarmentId(value) {
  if (typeof value !== 'string' || !GARMENT_UUID.test(value)) throw new TypeError('garmentId must be a UUID');
  return value.toLowerCase();
}
function normalizeSourceArtifactId(value) {
  if (typeof value !== 'string') throw new TypeError('sourceArtifactId must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('sourceArtifactId is outside the accepted Try-On contract');
  }
  return normalized;
}
function sameKeys(actual, expected) {
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}
function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`Try-On Editor handoff requires ${label}`);
}
function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}
function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}
function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  if (!sameKeys(actual, expected)) throw new Error(`${label} has unknown or missing fields`);
}
