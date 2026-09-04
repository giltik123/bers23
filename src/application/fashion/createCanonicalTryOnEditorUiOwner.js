import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng.js';
import { createCanonicalTryOnEditorController } from './createCanonicalTryOnEditorController.js';
import { createCanonicalTryOnProductRuntime } from './createCanonicalTryOnProductRuntime.js';
import { createTryOnEditorFinalHandoff } from './createTryOnEditorFinalHandoff.js';

const ENTRY_ACTIONS = new Set(['inspect', 'run']);
const CONTINUATION_ACTIONS = new Set(['resume', 'recover', 'retry']);
const CONTINUATION = new Set([
  'WARP_PENDING', 'TEXTURE_NOT_EXECUTED', 'TEXTURE_NOT_PREPARED',
  'TEXTURE_PENDING', 'TEXTURE_FAILED', 'TEXTURE_STALE',
]);

/**
 * Editor-level owner for canonical Try-On UI lifecycle.
 *
 * It is intentionally not React-specific: Editor can keep one instance in a
 * ref while ResultCompare temporarily unmounts the Outfit panel. The owner
 * publishes only safe UI snapshots and never exposes the controller, runtime,
 * session or request identity.
 */
export function createCanonicalTryOnEditorUiOwner({
  getProject,
  publishPendingResult,
  disposePendingPreview,
  onStateChange = () => {},
  reportError = () => {},
  createController = createProductionController,
}) {
  requireFunction(getProject, 'getProject');
  requireFunction(publishPendingResult, 'publishPendingResult');
  requireFunction(disposePendingPreview, 'disposePendingPreview');
  requireFunction(onStateChange, 'onStateChange');
  requireFunction(reportError, 'reportError');
  requireFunction(createController, 'createController');

  let controller = null;
  let selectionKey = '';
  let entryId = null;
  let garmentId = null;
  let lastOutcome = null;
  let epoch = 0;
  let operation = null;
  let disposed = false;

  const snapshot = () => {
    let phase = 'IDLE';
    let hasInFlight = false;
    let controllerBusy = false;
    if (controller) {
      const value = controller.snapshot();
      requirePlainObject(value, 'Canonical Try-On Editor controller snapshot');
      phase = requireString(value.phase, 'Try-On phase');
      hasInFlight = value.hasInFlight === true;
      controllerBusy = value.busy === true;
    }
    return Object.freeze({
      entryId,
      garmentId,
      phase,
      hasInFlight,
      busy: Boolean(operation) || controllerBusy,
      ...(lastOutcome ? { outcome: lastOutcome } : {}),
    });
  };

  const emit = () => onStateChange(snapshot());

  const invalidate = ({ close = false } = {}) => {
    const previous = controller;
    controller = null;
    selectionKey = '';
    entryId = null;
    garmentId = null;
    lastOutcome = null;
    operation = null;
    epoch += 1;
    if (close) disposed = true;
    if (previous) {
      try { previous.dispose(); } catch { /* stale async owner is already invalidated */ }
    }
    emit();
  };

  const ensureController = (payload) => {
    requireActive('selection');
    requirePlainObject(payload, 'Canonical Try-On UI selection');
    requireExactKeys(payload, ['entryId', 'outfit'], 'Canonical Try-On UI selection');
    const project = normalizeProject(getProject());
    const outfit = payload.outfit;
    requirePlainObject(outfit, 'Canonical Try-On UI Outfit');
    if (!Array.isArray(outfit.entries)) throw new TypeError('Canonical Try-On UI Outfit entries must be an array');
    const matches = outfit.entries.filter((entry) => entry?.entryId === payload.entryId);
    if (matches.length !== 1) throw new Error('Canonical Try-On UI selection must resolve one Outfit entry');
    const nextEntryId = requireString(matches[0].entryId, 'entryId');
    const nextGarmentId = requireString(matches[0].garmentId, 'garmentId');
    const key = [
      project.id,
      project.sourceArtifactId,
      requireString(outfit.id, 'outfit id'),
      String(outfit.revision ?? ''),
      nextEntryId,
    ].join(':');

    if (controller && selectionKey === key) return controller;
    if (controller) {
      const current = controller.snapshot();
      if (operation || current?.busy === true || current?.hasInFlight === true) {
        throw new Error('Abandon the active canonical Try-On run before selecting another garment');
      }
      invalidate();
    }

    const created = createController(Object.freeze({
      selection: Object.freeze({
        outfit,
        entryId: nextEntryId,
        projectId: project.id,
        sourceArtifactId: project.sourceArtifactId,
      }),
      beforeUrl: project.beforeUrl,
    }));
    requireController(created);
    controller = created;
    selectionKey = key;
    entryId = nextEntryId;
    garmentId = nextGarmentId;
    lastOutcome = null;
    epoch += 1;
    emit();
    return controller;
  };

  const requireExisting = (payload) => {
    requireActive('continuation');
    if (!controller) throw new Error('Canonical Try-On continuation requires an active selection');
    if (payload !== undefined && payload !== null) {
      requirePlainObject(payload, 'Canonical Try-On continuation selection');
      const keys = Object.keys(payload);
      if (keys.some((key) => !['entryId', 'outfit'].includes(key))) {
        throw new Error('Canonical Try-On continuation selection contains unknown fields');
      }
      if (payload.entryId !== undefined && payload.entryId !== entryId) {
        throw new Error('Canonical Try-On continuation does not match the active Outfit entry');
      }
    }
    return controller;
  };

  const act = async (action, payload) => {
    requireActive(action);
    if (!ENTRY_ACTIONS.has(action) && !CONTINUATION_ACTIONS.has(action) && action !== 'abandon') {
      throw new Error('Unknown canonical Try-On UI action');
    }
    if (operation) throw new Error(`Canonical Try-On UI ${action} cannot start while another action is in progress`);

    const target = ENTRY_ACTIONS.has(action) ? ensureController(payload) : requireExisting(payload);
    if (action === 'abandon') {
      target.abandon();
      lastOutcome = null;
      emit();
      return snapshot();
    }

    const token = Symbol(action);
    const actionEpoch = epoch;
    operation = token;
    emit();
    let failed = null;
    try {
      const result = await target[action]();
      if (controller !== target || epoch !== actionEpoch) {
        if (result?.status === 'FINAL_CANDIDATE') disposePendingPreview(result.pendingResult);
      } else if (result?.status === 'FINAL_CANDIDATE') {
        lastOutcome = null;
        try {
          publishPendingResult(result.pendingResult);
        } catch (error) {
          disposePendingPreview(result.pendingResult);
          throw error;
        }
      } else {
        lastOutcome = safeOutcome(result);
      }
    } catch (error) {
      failed = error;
      if (controller === target && epoch === actionEpoch) {
        lastOutcome = null;
        reportError(error);
      }
    } finally {
      if (operation === token) operation = null;
      emit();
    }
    if (failed) throw failed;
    return snapshot();
  };

  function requireActive(action) {
    if (disposed) throw new Error(`Canonical Try-On UI owner is disposed; ${action} is unavailable`);
  }

  return Object.freeze({
    state: snapshot,
    action: act,
    reset() {
      requireActive('reset');
      invalidate();
    },
    dispose() {
      if (disposed) return;
      invalidate({ close: true });
    },
  });
}

function createProductionController({ selection, beforeUrl }) {
  const handoff = createTryOnEditorFinalHandoff({
    encodePreviewPng: encodeDeterministicRgbaPng,
    createBlobUrl: async (bytes) => {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
        throw new Error('Canonical Try-On Editor PNG bytes are unavailable');
      }
      if (typeof globalThis.Blob !== 'function'
        || typeof globalThis.URL?.createObjectURL !== 'function') {
        throw new Error('Canonical Try-On Editor blob URL capability is unavailable');
      }
      return globalThis.URL.createObjectURL(new globalThis.Blob([bytes], { type: 'image/png' }));
    },
  });
  return createCanonicalTryOnEditorController({
    selection,
    beforeUrl,
    createRuntime: createCanonicalTryOnProductRuntime,
    handoff,
  });
}

function safeOutcome(value) {
  requirePlainObject(value, 'Canonical Try-On UI outcome');
  if (value.status === 'READINESS' || value.status === 'BLOCKED') {
    requireExactKeys(value, ['readiness', 'status'], 'Canonical Try-On UI readiness outcome');
    requirePlainObject(value.readiness, 'Canonical Try-On UI readiness projection');
    return Object.freeze({ status: value.status, readiness: value.readiness });
  }
  if (!CONTINUATION.has(value.status)) throw new Error('Unknown canonical Try-On UI outcome');
  requireExactKeys(value, ['status'], 'Canonical Try-On UI continuation outcome');
  return Object.freeze({ status: value.status });
}

function normalizeProject(value) {
  requirePlainObject(value, 'Canonical Try-On Editor Project');
  const id = requireString(value.id, 'project id');
  const sourceArtifactId = requireString(value.current_image_artifact_id, 'current image artifact id');
  const beforeUrl = requireString(value.current_image_url, 'current image URL');
  if (sourceArtifactId.length > 512 || /[\u0000-\u001f\u007f]/u.test(sourceArtifactId)) {
    throw new TypeError('Current image artifact id is outside the canonical Try-On contract');
  }
  return Object.freeze({ id, sourceArtifactId, beforeUrl });
}

function requireController(value) {
  requirePlainObject(value, 'Canonical Try-On Editor controller');
  for (const method of ['inspect', 'run', 'resume', 'recover', 'retry', 'abandon', 'dispose', 'snapshot']) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`Canonical Try-On Editor controller requires ${method}`);
    }
  }
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`Canonical Try-On UI owner requires ${label}`);
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
