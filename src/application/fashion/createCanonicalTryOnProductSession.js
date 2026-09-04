import { normalizeCanonicalTryOnReadinessSummary } from './canonicalTryOnReadinessContract.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SOURCE_ARTIFACT_MAX_LENGTH = 512;
const CONTINUATION = new Set([
  'WARP_PENDING', 'TEXTURE_NOT_EXECUTED', 'TEXTURE_NOT_PREPARED',
  'TEXTURE_PENDING', 'TEXTURE_FAILED', 'TEXTURE_STALE',
]);

/**
 * Ephemeral product-session state machine for one canonical Outfit entry and
 * one canonical Project image identity.
 *
 * The session is deliberately the only product layer that retains a
 * clientRequestId, and only while a run is in flight. The identifier is never
 * returned to React, Editor pendingResult, Project state or persistence.
 * Explicit Run/Retry always allocates a fresh identity. Resume/Recover reuse
 * the exact in-flight identity and never retry automatically. Mutating session
 * transitions are serialized so one request identity can never be advanced by
 * two concurrent product actions.
 */
export function createCanonicalTryOnProductSession({
  selection,
  readiness,
  application,
  createClientRequestId,
}) {
  const stable = normalizeSelection(selection);
  requireFunction(readiness?.inspect, 'readiness.inspect');
  requireFunction(application?.begin, 'application.begin');
  requireFunction(application?.resume, 'application.resume');
  requireFunction(application?.recover, 'application.recover');
  requireFunction(createClientRequestId, 'createClientRequestId');

  const usedRequestIds = new Set();
  let inFlight = null;
  let phase = 'IDLE';
  let operation = null;

  const inspect = async () => normalizeReadiness(
    await readiness.inspect(stable.readinessSelection),
    stable.entryId,
  );

  const allocateIntent = (garmentId) => {
    const clientRequestId = normalizeClientRequestId(createClientRequestId());
    if (usedRequestIds.has(clientRequestId)) {
      throw new Error('Canonical Try-On client request generator reused an explicit-run identity');
    }
    usedRequestIds.add(clientRequestId);
    return Object.freeze({
      projectId: stable.projectId,
      sourceArtifactId: stable.sourceArtifactId,
      garmentId,
      clientRequestId,
    });
  };

  const projectResult = (result) => {
    requirePlainObject(result, 'Canonical Try-On product result');

    if (result.status === 'PREREQUISITE') {
      requireExactKeys(result, ['readiness', 'status'], 'Canonical Try-On prerequisite result');
      const blocked = normalizeApplicationReadiness(result.readiness, stable.entryId, inFlight?.garmentId);
      inFlight = null;
      phase = 'BLOCKED';
      return Object.freeze({ status: 'BLOCKED', readiness: blocked });
    }

    if (result.status === 'FINAL_READY') {
      requireFinal(result);
      if (!inFlight) throw new Error('Canonical Try-On FINAL arrived without an in-flight product intent');
      phase = 'FINAL_READY';
      return Object.freeze({
        status: 'FINAL_READY',
        garmentId: inFlight.garmentId,
        sourceArtifactId: inFlight.sourceArtifactId,
        final: result,
      });
    }

    if (!CONTINUATION.has(result.status)) {
      throw new Error('Unknown canonical Try-On product continuation status');
    }
    requireExactKeys(result, ['status'], 'Canonical Try-On continuation result');
    if (!inFlight) throw new Error('Canonical Try-On continuation arrived without an in-flight product intent');
    phase = result.status;
    return Object.freeze({ status: result.status });
  };

  const requireContinuable = (method) => {
    if (!inFlight) throw new Error(`Canonical Try-On ${method} requires an in-flight run`);
    if (phase === 'FINAL_READY') {
      throw new Error(`Canonical Try-On ${method} is blocked after FINAL_READY until Editor handoff is completed or the run is abandoned`);
    }
    if (phase !== 'UNCERTAIN' && !CONTINUATION.has(phase)) {
      throw new Error(`Canonical Try-On ${method} is unavailable during ${phase}`);
    }
  };

  const invokeInFlight = async (method) => {
    requireContinuable(method);
    try {
      return projectResult(await application[method](inFlight));
    } catch (error) {
      phase = 'UNCERTAIN';
      throw error;
    }
  };

  const beginFresh = async () => {
    if (inFlight) throw new Error('Canonical Try-On already has an in-flight run; Resume, Recover, Retry or abandon it explicitly');
    const currentReadiness = await inspect();
    if (currentReadiness.status !== 'READY') {
      phase = 'BLOCKED';
      return Object.freeze({ status: 'BLOCKED', readiness: currentReadiness });
    }

    phase = 'ALLOCATING';
    try {
      inFlight = allocateIntent(currentReadiness.garmentId);
    } catch (error) {
      phase = 'IDLE';
      throw error;
    }
    phase = 'BEGINNING';
    try {
      return projectResult(await application.begin(inFlight));
    } catch (error) {
      // Ambiguous begin outcome deliberately keeps the exact request identity
      // available for an explicit Recover/Resume. No automatic retry occurs.
      phase = 'UNCERTAIN';
      throw error;
    }
  };

  const exclusive = async (name, action) => {
    if (operation) {
      throw new Error(`Canonical Try-On ${name} cannot start while ${operation} is in progress`);
    }
    operation = name;
    try {
      return await action();
    } finally {
      operation = null;
    }
  };

  const requireNoOperation = (name) => {
    if (operation) {
      throw new Error(`Canonical Try-On ${name} cannot run while ${operation} is in progress`);
    }
  };

  return Object.freeze({
    inspect,

    begin() {
      return exclusive('begin', beginFresh);
    },

    resume() {
      return exclusive('resume', () => invokeInFlight('resume'));
    },

    recover() {
      return exclusive('recover', () => invokeInFlight('recover'));
    },

    retry() {
      return exclusive('retry', async () => {
        // Retry is an explicit new run, never a hidden re-execution of the old
        // request identity. The old identity remains in usedRequestIds so a
        // broken generator cannot accidentally reuse it.
        inFlight = null;
        phase = 'IDLE';
        return beginFresh();
      });
    },

    completeFinal() {
      requireNoOperation('completeFinal');
      if (!inFlight || phase !== 'FINAL_READY') {
        throw new Error('Canonical Try-On FINAL can be completed only after a successful Editor handoff');
      }
      inFlight = null;
      phase = 'IDLE';
    },

    abandon() {
      requireNoOperation('abandon');
      inFlight = null;
      phase = 'IDLE';
    },

    snapshot() {
      return Object.freeze({ hasInFlight: Boolean(inFlight), phase, busy: Boolean(operation) });
    },
  });
}

function normalizeSelection(value) {
  requirePlainObject(value, 'Canonical Try-On product selection');
  requireExactKeys(value, ['entryId', 'outfit', 'projectId', 'sourceArtifactId'], 'Canonical Try-On product selection');
  requirePlainObject(value.outfit, 'Canonical Try-On product Outfit');
  const entryId = uuid(value.entryId, 'entryId');
  const projectId = uuid(value.projectId, 'projectId');
  const sourceArtifactId = normalizeSourceArtifactId(value.sourceArtifactId);
  return Object.freeze({
    entryId,
    projectId,
    sourceArtifactId,
    readinessSelection: Object.freeze({
      entryId,
      outfit: value.outfit,
      projectId,
      sourceArtifactId,
    }),
  });
}

function normalizeReadiness(value, entryId) {
  requirePlainObject(value, 'Canonical Try-On readiness selection result');
  const allowed = value.categoryGroup === undefined
    ? ['entryId', 'garmentId', 'status']
    : ['categoryGroup', 'entryId', 'garmentId', 'status'];
  requireExactKeys(value, allowed, 'Canonical Try-On readiness selection result');
  const responseEntryId = uuid(value.entryId, 'entryId');
  if (responseEntryId !== entryId) throw new Error('Canonical Try-On readiness does not match the selected Outfit entry');
  const garmentId = uuid(value.garmentId, 'garmentId');
  const summary = normalizeCanonicalTryOnReadinessSummary(
    value.categoryGroup === undefined
      ? { status: value.status }
      : { status: value.status, categoryGroup: value.categoryGroup },
    'Canonical Try-On readiness',
  );
  return Object.freeze({ entryId, garmentId, ...summary });
}

function normalizeApplicationReadiness(value, entryId, garmentId) {
  requirePlainObject(value, 'Canonical Try-On application prerequisite');
  const allowed = value.categoryGroup === undefined ? ['status'] : ['categoryGroup', 'status'];
  requireExactKeys(value, allowed, 'Canonical Try-On application prerequisite');
  if (!garmentId) throw new Error('Canonical Try-On prerequisite arrived without a stable garment intent');
  const summary = normalizeCanonicalTryOnReadinessSummary(
    value.categoryGroup === undefined
      ? { status: value.status }
      : { status: value.status, categoryGroup: value.categoryGroup },
    'Canonical Try-On prerequisite',
  );
  if (summary.status === 'READY') throw new Error('Canonical Try-On prerequisite cannot report READY');
  return Object.freeze({ entryId, garmentId, ...summary });
}

function requireFinal(value) {
  const keys = Object.keys(value).sort();
  const local = ['artifactId', 'preview', 'status'];
  const recovery = ['artifactId', 'preview', 'previewExpiresAt', 'status'];
  if (!sameKeys(keys, local) && !sameKeys(keys, recovery)) {
    throw new Error('Canonical Try-On FINAL has unknown or missing fields');
  }
  if (typeof value.artifactId !== 'string' || !value.artifactId.trim()) {
    throw new Error('Canonical Try-On FINAL artifact identity is unavailable');
  }
  if (!Object.hasOwn(value, 'preview')) throw new Error('Canonical Try-On FINAL preview is unavailable');
  if (Object.hasOwn(value, 'previewExpiresAt')
    && (!Number.isSafeInteger(value.previewExpiresAt) || value.previewExpiresAt <= 0)) {
    throw new Error('Canonical Try-On FINAL recovery expiry is invalid');
  }
}

function normalizeClientRequestId(value) {
  if (typeof value !== 'string') throw new TypeError('Canonical Try-On clientRequestId must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > 179 || !CLIENT_REQUEST_ID.test(normalized)) {
    throw new TypeError('Canonical Try-On clientRequestId is outside the accepted product contract');
  }
  return normalized;
}

function normalizeSourceArtifactId(value) {
  if (typeof value !== 'string') throw new TypeError('sourceArtifactId must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > SOURCE_ARTIFACT_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('sourceArtifactId is outside the accepted Try-On product contract');
  }
  return normalized;
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`Canonical Try-On product session requires ${label}`);
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
