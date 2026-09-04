const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROLLER_METHODS = Object.freeze(['inspect', 'run', 'resume', 'recover', 'retry', 'abandon', 'dispose', 'snapshot']);
const MANUAL_METHODS = Object.freeze(['loadGarmentSource', 'saveContour', 'saveBodyAnchors']);

/**
 * Editor-owned host for canonical Try-On controllers.
 *
 * The host owns at most one controller at a time and never exposes that
 * controller. Selection changes are fail-closed while the previous controller
 * is busy or still owns an in-flight run, preventing React navigation from
 * silently abandoning or replacing an execution identity.
 *
 * React unmount is synchronous, so requestDispose() supports a deferred cleanup
 * request while one controller operation is busy. No new action may begin after
 * that request, and the host disposes the controller immediately after the
 * current async operation settles.
 */
export function createCanonicalTryOnEditorHost({ createController }) {
  requireFunction(createController, 'createController');

  let active = null;
  let activeKey = null;
  let disposed = false;
  let disposeRequested = false;

  const requireActiveHost = (action) => {
    if (disposed) throw new Error(`Canonical Try-On Editor host is disposed; ${action} is unavailable`);
    if (disposeRequested) throw new Error(`Canonical Try-On Editor host disposal was requested; ${action} is unavailable`);
  };

  const readControllerSnapshot = (controller) => {
    const snapshot = controller.snapshot();
    requirePlainObject(snapshot, 'Canonical Try-On controller snapshot');
    requireExactKeys(snapshot, ['busy', 'disposed', 'hasInFlight', 'phase'], 'Canonical Try-On controller snapshot');
    if (typeof snapshot.busy !== 'boolean'
      || typeof snapshot.disposed !== 'boolean'
      || typeof snapshot.hasInFlight !== 'boolean'
      || typeof snapshot.phase !== 'string'
      || !snapshot.phase.trim()) {
      throw new Error('Canonical Try-On controller snapshot is invalid');
    }
    return snapshot;
  };

  const clearActive = () => {
    active = null;
    activeKey = null;
  };

  const disposeActive = () => {
    if (!active) return;
    active.dispose();
    clearActive();
  };

  const finishRequestedDispose = () => {
    if (!disposeRequested || disposed) return;
    if (!active) {
      disposeRequested = false;
      disposed = true;
      return;
    }
    const snapshot = readControllerSnapshot(active);
    if (snapshot.busy) return;
    active.dispose();
    clearActive();
    disposeRequested = false;
    disposed = true;
  };

  const ensure = (context) => {
    requireActiveHost('selection');
    const normalized = normalizeContext(context);
    if (active && activeKey === normalized.key) return active;

    if (active) {
      const snapshot = readControllerSnapshot(active);
      if (snapshot.busy || snapshot.hasInFlight) {
        throw new Error('Canonical Try-On selection cannot change while the current run is busy or in flight');
      }
      disposeActive();
    }

    const controller = createController(Object.freeze({
      selection: normalized.selection,
      beforeUrl: normalized.beforeUrl,
    }));
    requireController(controller);
    const snapshot = readControllerSnapshot(controller);
    if (snapshot.disposed || snapshot.busy || snapshot.hasInFlight || snapshot.phase !== 'IDLE') {
      try { controller.dispose(); } catch { /* fail below with the original admission error */ }
      throw new Error('Canonical Try-On controller must enter the Editor host in an idle state');
    }

    active = controller;
    activeKey = normalized.key;
    return active;
  };

  const invoke = async (context, method) => {
    const controller = ensure(context);
    try {
      return await controller[method]();
    } finally {
      finishRequestedDispose();
    }
  };

  const invokeCurrent = async (action, method) => {
    const controller = requireCurrent(action);
    try {
      return await controller[method]();
    } finally {
      finishRequestedDispose();
    }
  };

  const requireCurrent = (action) => {
    requireActiveHost(action);
    if (!active) throw new Error(`Canonical Try-On ${action} requires an active Editor selection`);
    return active;
  };

  return Object.freeze({
    inspect(context) {
      return invoke(context, 'inspect');
    },

    run(context) {
      return invoke(context, 'run');
    },

    resume(context) {
      return invoke(context, 'resume');
    },

    recover(context) {
      return invoke(context, 'recover');
    },

    manual(context) {
      const controller = ensure(context);
      requireMethods(controller.manual, MANUAL_METHODS, 'manual prerequisite application');
      return controller.manual;
    },

    retry() {
      return invokeCurrent('retry', 'retry');
    },

    abandon() {
      const controller = requireCurrent('abandon');
      controller.abandon();
      const snapshot = readControllerSnapshot(controller);
      if (snapshot.busy || snapshot.hasInFlight) {
        throw new Error('Canonical Try-On controller remained active after abandon');
      }
    },

    release() {
      requireActiveHost('release');
      if (!active) return;
      const snapshot = readControllerSnapshot(active);
      if (snapshot.busy || snapshot.hasInFlight) {
        throw new Error('Canonical Try-On Editor host cannot release a busy or in-flight controller');
      }
      disposeActive();
    },

    requestDispose() {
      if (disposed) return true;
      if (disposeRequested) return false;
      disposeRequested = true;
      finishRequestedDispose();
      return disposed;
    },

    dispose() {
      if (disposed) return;
      if (disposeRequested) throw new Error('Canonical Try-On Editor host disposal is already requested');
      if (active) {
        const snapshot = readControllerSnapshot(active);
        if (snapshot.busy) {
          throw new Error('Canonical Try-On Editor host cannot dispose while the controller is busy');
        }
        active.dispose();
        clearActive();
      }
      disposed = true;
    },

    snapshot() {
      if (!active) {
        return Object.freeze({ active: false, busy: false, disposed, hasInFlight: false, phase: 'IDLE' });
      }
      const snapshot = readControllerSnapshot(active);
      return Object.freeze({
        active: true,
        busy: snapshot.busy,
        disposed,
        hasInFlight: snapshot.hasInFlight,
        phase: snapshot.phase,
      });
    },
  });
}

function normalizeContext(value) {
  requirePlainObject(value, 'Canonical Try-On Editor host context');
  requireExactKeys(value, ['beforeUrl', 'selection'], 'Canonical Try-On Editor host context');
  requirePlainObject(value.selection, 'Canonical Try-On Editor host selection');
  requireExactKeys(value.selection, ['entryId', 'outfit', 'projectId', 'sourceArtifactId'], 'Canonical Try-On Editor host selection');
  requirePlainObject(value.selection.outfit, 'Canonical Try-On Editor host Outfit');

  const projectId = uuid(value.selection.projectId, 'projectId');
  const entryId = uuid(value.selection.entryId, 'entryId');
  const sourceArtifactId = sourceArtifact(value.selection.sourceArtifactId);
  const outfitId = uuid(value.selection.outfit.id, 'outfit.id');
  const outfitRevision = positiveRevision(value.selection.outfit.revision);
  const beforeUrl = nonEmptyString(value.beforeUrl, 'beforeUrl');

  const selection = Object.freeze({
    entryId,
    outfit: value.selection.outfit,
    projectId,
    sourceArtifactId,
  });
  const key = `${projectId}\u0000${sourceArtifactId}\u0000${outfitId}\u0000${outfitRevision}\u0000${entryId}\u0000${beforeUrl}`;
  return Object.freeze({ selection, beforeUrl, key });
}

function positiveRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('outfit.revision must be a positive safe integer');
  return value;
}

function sourceArtifact(value) {
  if (typeof value !== 'string') throw new TypeError('sourceArtifactId must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError('sourceArtifactId is outside the accepted Try-On Editor host contract');
  }
  return normalized;
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${label} must be a UUID`);
  return value.toLowerCase();
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function requireController(value) {
  requireMethods(value, CONTROLLER_METHODS, 'Editor controller');
  requireMethods(value.manual, MANUAL_METHODS, 'manual prerequisite application');
}

function requireMethods(value, methods, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Canonical Try-On Editor host requires ${label}`);
  for (const method of methods) {
    if (typeof value[method] !== 'function') throw new TypeError(`Canonical Try-On Editor host requires ${label}.${method}`);
  }
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`Canonical Try-On Editor host requires ${label}`);
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}
