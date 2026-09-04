import {
  normalizeCanonicalTryOnReadinessSummary,
  requireCanonicalTryOnSupportedCategoryGroup,
} from './canonicalTryOnReadinessContract.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const PREVIEW_DELIVERY_URL = /^\/api\/core\/artifacts\/results\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Pure product-application coordinator for deterministic Fashion Try-On.
 *
 * It accepts only stable product intent and delegates prepared descriptors
 * directly to injected local executors. It never persists or exposes ticket,
 * evidence, storage, financial, external-execution or Project-mutation authority.
 */
export function createCanonicalTryOnApplication({ core, executeWarp, executeTexture }) {
  requireFunction(core?.checkTryOnReadiness, 'checkTryOnReadiness');
  requireFunction(core?.prepareTryOn, 'prepareTryOn');
  requireFunction(core?.continueTryOn, 'continueTryOn');
  requireFunction(core?.getTryOnResult, 'getTryOnResult');
  requireFunction(core?.getTryOnPreview, 'getTryOnPreview');
  requireFunction(executeWarp, 'executeWarp');
  requireFunction(executeTexture, 'executeTexture');

  const checkReadiness = async (value) => {
    const intent = readinessIntent(value);
    return normalizeReadiness(await core.checkTryOnReadiness(intent), intent);
  };

  const recover = async (value) => {
    const intent = runIntent(value);
    return normalizePreview(await core.getTryOnPreview(intent), intent);
  };

  const advance = async (intent, { allowTextureExecution }) => {
    const continuation = await core.continueTryOn(intent);
    if (continuation?.status === 'PREREQUISITE') {
      return prerequisiteState(normalizePrerequisite(continuation, intent));
    }
    if (continuation?.status === 'WARP_PENDING') {
      requireExactKeys(continuation, ['garmentId', 'projectId', 'sourceArtifactId', 'status'], 'Try-On WARP_PENDING');
      assertStableEcho(continuation, intent);
      return Object.freeze({ status: 'WARP_PENDING' });
    }
    requireExactKeys(
      continuation,
      ['garmentId', 'preparedExecution', 'projectId', 'sourceArtifactId', 'status'],
      'Try-On texture preparation',
    );
    if (continuation.status !== 'TEXTURE_PREPARED') throw new Error('Unexpected Try-On continuation status');
    assertStableEcho(continuation, intent);
    if (!allowTextureExecution) return Object.freeze({ status: 'TEXTURE_NOT_EXECUTED' });

    const texture = await executeTexture(Object.freeze({
      projectId: intent.projectId,
      preparedExecution: continuation.preparedExecution,
    }));
    const result = await core.getTryOnResult(intent);
    return normalizeResult(result, intent, texture?.preview ?? null);
  };

  return Object.freeze({
    checkReadiness,

    async begin(value) {
      const intent = runIntent(value);
      const prepared = await core.prepareTryOn(intent);
      if (prepared?.status === 'PREREQUISITE') {
        return prerequisiteState(normalizePrerequisite(prepared, intent));
      }
      requireExactKeys(
        prepared,
        ['categoryGroup', 'garmentId', 'preparedExecution', 'projectId', 'sourceArtifactId', 'status'],
        'Try-On warp preparation',
      );
      if (prepared.status !== 'WARP_PREPARED') throw new Error('Unexpected Try-On prepare status');
      assertStableEcho(prepared, intent);
      requireCanonicalTryOnSupportedCategoryGroup(prepared.categoryGroup, 'Try-On WARP_PREPARED');
      await executeWarp(Object.freeze({ projectId: intent.projectId, preparedExecution: prepared.preparedExecution }));
      return advance(intent, { allowTextureExecution: true });
    },

    /** Explicit user/recovery continuation. Never calls prepare or re-runs warp. */
    async resume(value) {
      const intent = runIntent(value);
      return advance(intent, { allowTextureExecution: true });
    },

    /** Read-only recovery. Never executes pixels or advances orchestration. */
    recover,
  });
}

export function createFashionTryOnClientRequestId(randomUUID = () => globalThis.crypto.randomUUID()) {
  const value = randomUUID();
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Try-On client request generator must return a UUID');
  return `fashion-tryon:${value.toLowerCase()}`;
}

function readinessIntent(value) {
  requirePlainObject(value, 'Try-On readiness intent');
  requireExactKeys(value, ['garmentId', 'projectId', 'sourceArtifactId'], 'Try-On readiness intent');
  return Object.freeze({
    projectId: uuid(value.projectId, 'projectId'),
    sourceArtifactId: sourceArtifactId(value.sourceArtifactId),
    garmentId: uuid(value.garmentId, 'garmentId'),
  });
}

function runIntent(value) {
  requirePlainObject(value, 'Try-On run intent');
  requireExactKeys(value, ['clientRequestId', 'garmentId', 'projectId', 'sourceArtifactId'], 'Try-On run intent');
  const base = readinessIntent({
    projectId: value.projectId,
    sourceArtifactId: value.sourceArtifactId,
    garmentId: value.garmentId,
  });
  if (typeof value.clientRequestId !== 'string') throw new TypeError('clientRequestId must be a string');
  const clientRequestId = value.clientRequestId.trim();
  if (!clientRequestId || clientRequestId.length > 179 || !CLIENT_REQUEST_ID.test(clientRequestId)) {
    throw new TypeError('clientRequestId is outside the accepted Try-On contract');
  }
  return Object.freeze({ ...base, clientRequestId });
}

function normalizePrerequisite(value, intent) {
  requireExactKeys(value, ['readiness', 'status'], 'Try-On prerequisite');
  return normalizeReadiness(value.readiness, intent);
}

function normalizeReadiness(value, intent) {
  requirePlainObject(value, 'Try-On readiness response');
  const allowed = value.categoryGroup === undefined
    ? ['garmentId', 'projectId', 'sourceArtifactId', 'status']
    : ['categoryGroup', 'garmentId', 'projectId', 'sourceArtifactId', 'status'];
  requireExactKeys(value, allowed, 'Try-On readiness response');
  assertStableEcho(value, intent);
  return normalizeCanonicalTryOnReadinessSummary(
    value.categoryGroup === undefined
      ? { status: value.status }
      : { status: value.status, categoryGroup: value.categoryGroup },
    'Try-On readiness',
  );
}

function normalizePreview(value, intent) {
  requirePlainObject(value, 'Try-On preview result');
  if (value.status === 'FINAL_READY') throw new Error('Try-On preview endpoint returned FINAL_READY without preview delivery');
  if (value.status !== 'PREVIEW_READY') return normalizeResult(value, intent, null);
  requireExactKeys(
    value,
    ['artifactId', 'garmentId', 'previewExpiresAt', 'previewUrl', 'projectId', 'sourceArtifactId', 'status'],
    'Try-On PREVIEW_READY result',
  );
  assertStableEcho(value, intent);
  if (typeof value.artifactId !== 'string' || !value.artifactId.trim()) throw new Error('Try-On FINAL artifact identity is missing');
  if (typeof value.previewUrl !== 'string' || !PREVIEW_DELIVERY_URL.test(value.previewUrl)) {
    throw new Error('Try-On recovery preview URL is outside the accepted delivery contract');
  }
  if (!Number.isSafeInteger(value.previewExpiresAt) || value.previewExpiresAt <= 0) {
    throw new Error('Try-On recovery preview expiry is outside the accepted delivery contract');
  }
  return Object.freeze({
    status: 'FINAL_READY',
    artifactId: value.artifactId,
    preview: value.previewUrl,
    previewExpiresAt: value.previewExpiresAt,
  });
}

function normalizeResult(value, intent, preview) {
  requirePlainObject(value, 'Try-On result');
  if (value.status === 'PREREQUISITE') return prerequisiteState(normalizePrerequisite(value, intent));
  if (value.status === 'FINAL_READY') {
    requireExactKeys(value, ['artifactId', 'garmentId', 'projectId', 'sourceArtifactId', 'status'], 'Try-On FINAL result');
    assertStableEcho(value, intent);
    if (typeof value.artifactId !== 'string' || !value.artifactId.trim()) throw new Error('Try-On FINAL artifact identity is missing');
    return Object.freeze({
      status: 'FINAL_READY',
      artifactId: value.artifactId,
      ...(preview ? { preview } : {}),
    });
  }
  if (!['TEXTURE_NOT_PREPARED', 'TEXTURE_PENDING', 'TEXTURE_FAILED', 'TEXTURE_STALE'].includes(value.status)) {
    throw new Error('Unknown Try-On result status');
  }
  requireExactKeys(value, ['garmentId', 'projectId', 'sourceArtifactId', 'status'], 'Try-On result');
  assertStableEcho(value, intent);
  return Object.freeze({ status: value.status });
}

function prerequisiteState(readiness) {
  return Object.freeze({ status: 'PREREQUISITE', readiness });
}

function assertStableEcho(value, intent) {
  if (value.projectId !== intent.projectId
    || value.sourceArtifactId !== intent.sourceArtifactId
    || value.garmentId !== intent.garmentId) {
    throw new Error('Try-On response does not match the stable product intent');
  }
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
}

function sourceArtifactId(value) {
  if (typeof value !== 'string') throw new TypeError('sourceArtifactId must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('sourceArtifactId is outside the accepted Try-On contract');
  }
  return normalized;
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`Canonical Try-On application requires ${label}`);
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function sameKeys(actual, expected) {
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function requireExactKeys(value, expected, label) {
  requirePlainObject(value, label);
  const actual = Object.keys(value).sort();
  if (!sameKeys(actual, expected)) throw new Error(`${label} has unknown or missing fields`);
}
