import { normalizeCanonicalTryOnReadinessSummary } from './canonicalTryOnReadinessContract.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_METHODS = Object.freeze(['inspect', 'begin', 'resume', 'recover', 'retry', 'completeFinal', 'abandon', 'snapshot']);
const MANUAL_METHODS = Object.freeze(['loadGarmentSource', 'saveContour', 'saveBodyAnchors']);
const CONTINUATION = new Set([
  'WARP_PENDING', 'TEXTURE_NOT_EXECUTED', 'TEXTURE_NOT_PREPARED',
  'TEXTURE_PENDING', 'TEXTURE_FAILED', 'TEXTURE_STALE',
]);

/**
 * Editor-owned ephemeral controller for one explicit canonical Try-On selection.
 *
 * The controller may live in an Editor ref while the Outfit panel unmounts for
 * ResultCompare, but it never returns the underlying product session. FINAL is
 * handed off to the accepted Editor candidate boundary and acknowledged only
 * after that handoff succeeds. This clears the in-flight request identity before
 * the pending result is exposed. Explicit Retry remains available on this
 * controller and delegates to the session's fresh-run semantics.
 */
export function createCanonicalTryOnEditorController({
  selection,
  beforeUrl,
  createRuntime,
  handoff,
}) {
  requireFunction(createRuntime, 'createRuntime');
  requireFunction(handoff, 'handoff');
  const stableSelection = normalizeSelection(selection);
  const stableBeforeUrl = requireString(beforeUrl, 'beforeUrl');
  // Match the production root contract directly. Keeping this options shape at
  // the controller boundary avoids a UI-only adapter with subtly different
  // semantics from createCanonicalTryOnProductRuntime({ selection }).
  const runtime = createRuntime(Object.freeze({ selection: stableSelection }));
  requireObject(runtime, 'product runtime');
  requireMethods(runtime.session, SESSION_METHODS, 'product runtime session');
  requireMethods(runtime.manual, MANUAL_METHODS, 'product runtime manual application');

  const session = runtime.session;
  const manual = runtime.manual;
  let operation = null;
  let disposed = false;

  const requireActive = (action) => {
    if (disposed) throw new Error(`Canonical Try-On Editor controller is disposed; ${action} is unavailable`);
  };

  const exclusive = async (name, action) => {
    requireActive(name);
    if (operation) throw new Error(`Canonical Try-On Editor ${name} cannot start while ${operation} is in progress`);
    operation = name;
    try {
      return await action();
    } finally {
      operation = null;
    }
  };

  const projectResult = async (result) => {
    requirePlainObject(result, 'Canonical Try-On Editor session result');
    if (result.status === 'BLOCKED') {
      requireExactKeys(result, ['readiness', 'status'], 'Canonical Try-On Editor blocked result');
      return Object.freeze({ status: 'BLOCKED', readiness: normalizeReadiness(result.readiness, stableSelection.entryId) });
    }
    if (result.status === 'FINAL_READY') {
      requireExactKeys(result, ['final', 'garmentId', 'sourceArtifactId', 'status'], 'Canonical Try-On Editor FINAL result');
      const garmentId = uuid(result.garmentId, 'garmentId');
      const sourceArtifactId = normalizeSourceArtifactId(result.sourceArtifactId);
      if (sourceArtifactId !== stableSelection.sourceArtifactId) {
        throw new Error('Canonical Try-On FINAL source does not match the Editor selection');
      }
      const finalArtifactId = normalizeFinalIdentity(result.final);
      const pending = normalizePendingCandidate(await handoff(Object.freeze({
        beforeUrl: stableBeforeUrl,
        final: result.final,
        garmentId,
        sourceArtifactId,
      })), {
        garmentId,
        sourceArtifactId,
        beforeUrl: stableBeforeUrl,
        finalArtifactId,
      });
      // Do not clear the in-flight request until the safe Editor candidate has
      // been completely produced and validated. A failed handoff leaves the
      // session in FINAL_READY for explicit Retry/abandon, never hidden retry.
      session.completeFinal();
      return Object.freeze({ status: 'FINAL_CANDIDATE', pendingResult: pending });
    }
    if (!CONTINUATION.has(result.status)) {
      throw new Error('Unknown canonical Try-On Editor continuation status');
    }
    requireExactKeys(result, ['status'], 'Canonical Try-On Editor continuation result');
    return Object.freeze({ status: result.status });
  };

  const invoke = (name, action) => exclusive(name, async () => projectResult(await action()));

  return Object.freeze({
    manual,

    inspect() {
      return exclusive('inspect', async () => Object.freeze({
        status: 'READINESS',
        readiness: normalizeReadiness(await session.inspect(), stableSelection.entryId),
      }));
    },

    run() {
      return invoke('run', () => session.begin());
    },

    resume() {
      return invoke('resume', () => session.resume());
    },

    recover() {
      return invoke('recover', () => session.recover());
    },

    retry() {
      return invoke('retry', () => session.retry());
    },

    abandon() {
      requireActive('abandon');
      if (operation) throw new Error(`Canonical Try-On Editor abandon cannot run while ${operation} is in progress`);
      session.abandon();
    },

    dispose() {
      if (disposed) return;
      if (operation) throw new Error(`Canonical Try-On Editor dispose cannot run while ${operation} is in progress`);
      session.abandon();
      disposed = true;
    },

    snapshot() {
      const state = session.snapshot();
      requirePlainObject(state, 'Canonical Try-On product session snapshot');
      requireExactKeys(state, ['busy', 'hasInFlight', 'phase'], 'Canonical Try-On product session snapshot');
      return Object.freeze({
        busy: Boolean(operation) || state.busy === true,
        disposed,
        hasInFlight: state.hasInFlight === true,
        phase: requireString(state.phase, 'session phase'),
      });
    },
  });
}

function normalizeSelection(value) {
  requirePlainObject(value, 'Canonical Try-On Editor selection');
  requireExactKeys(value, ['entryId', 'outfit', 'projectId', 'sourceArtifactId'], 'Canonical Try-On Editor selection');
  const sourceArtifactId = normalizeSourceArtifactId(value.sourceArtifactId);
  return Object.freeze({
    entryId: uuid(value.entryId, 'entryId'),
    outfit: value.outfit,
    projectId: uuid(value.projectId, 'projectId'),
    sourceArtifactId,
  });
}

function normalizeReadiness(value, expectedEntryId) {
  requirePlainObject(value, 'Canonical Try-On Editor readiness');
  const allowed = value.categoryGroup === undefined
    ? ['entryId', 'garmentId', 'status']
    : ['categoryGroup', 'entryId', 'garmentId', 'status'];
  requireExactKeys(value, allowed, 'Canonical Try-On Editor readiness');
  const entryId = uuid(value.entryId, 'entryId');
  if (entryId !== expectedEntryId) {
    throw new Error('Canonical Try-On Editor readiness does not match the selected Outfit entry');
  }
  const garmentId = uuid(value.garmentId, 'garmentId');
  const summary = normalizeCanonicalTryOnReadinessSummary(
    Object.freeze({
      status: value.status,
      ...(value.categoryGroup === undefined ? {} : { categoryGroup: value.categoryGroup }),
    }),
    'Canonical Try-On Editor readiness',
  );
  return Object.freeze({ entryId, garmentId, ...summary });
}

function normalizeFinalIdentity(value) {
  requirePlainObject(value, 'Canonical Try-On Editor FINAL');
  if (value.status !== 'FINAL_READY') throw new Error('Canonical Try-On Editor handoff requires FINAL_READY');
  return requireString(value.artifactId, 'FINAL artifactId');
}

function normalizePendingCandidate(value, expected) {
  requirePlainObject(value, 'Canonical Try-On Editor pending candidate');
  requireExactKeys(value, ['beforeUrl', 'context', 'instruction', 'kind', 'result'], 'Canonical Try-On Editor pending candidate');
  if (value.kind !== 'FASHION_TRYON') throw new Error('Canonical Try-On Editor pending candidate kind is invalid');
  if (value.instruction !== 'Try on garment') throw new Error('Canonical Try-On Editor pending instruction is invalid');
  if (value.beforeUrl !== expected.beforeUrl) throw new Error('Canonical Try-On Editor pending beforeUrl changed during handoff');

  requirePlainObject(value.context, 'Canonical Try-On Editor pending context');
  requireExactKeys(value.context, ['garmentId', 'sourceArtifactId'], 'Canonical Try-On Editor pending context');
  if (uuid(value.context.garmentId, 'pending garmentId') !== expected.garmentId
    || normalizeSourceArtifactId(value.context.sourceArtifactId) !== expected.sourceArtifactId) {
    throw new Error('Canonical Try-On Editor pending context does not match the FINAL intent');
  }

  requirePlainObject(value.result, 'Canonical Try-On Editor pending result');
  requireExactKeys(
    value.result,
    ['credits_used', 'finalArtifactId', 'image_url', 'preview_url', 'provider'],
    'Canonical Try-On Editor pending result',
  );
  const finalArtifactId = requireString(value.result.finalArtifactId, 'finalArtifactId');
  if (finalArtifactId !== expected.finalArtifactId) {
    throw new Error('Canonical Try-On Editor pending artifact does not match the FINAL identity');
  }
  const previewUrl = requireString(value.result.preview_url, 'preview_url');
  if (value.result.image_url !== previewUrl) throw new Error('Canonical Try-On Editor pending image/preview URLs diverged');
  if (value.result.provider !== 'Local deterministic' || value.result.credits_used !== 0) {
    throw new Error('Canonical Try-On Editor pending result claimed non-local or billed execution');
  }

  return Object.freeze({
    kind: 'FASHION_TRYON',
    result: Object.freeze({
      finalArtifactId,
      preview_url: previewUrl,
      image_url: previewUrl,
      provider: 'Local deterministic',
      credits_used: 0,
    }),
    instruction: 'Try on garment',
    beforeUrl: expected.beforeUrl,
    context: Object.freeze({
      garmentId: expected.garmentId,
      sourceArtifactId: expected.sourceArtifactId,
    }),
  });
}

function normalizeSourceArtifactId(value) {
  if (typeof value !== 'string') throw new TypeError('sourceArtifactId must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('sourceArtifactId is outside the accepted Try-On Editor contract');
  }
  return normalized;
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`Canonical Try-On Editor controller requires ${label}`);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Canonical Try-On Editor controller requires ${label}`);
  }
}

function requireMethods(value, methods, label) {
  requireObject(value, label);
  for (const method of methods) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`Canonical Try-On Editor controller requires ${label}.${method}`);
    }
  }
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function requireExactKeys(value, expected, label) {
  requirePlainObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}
