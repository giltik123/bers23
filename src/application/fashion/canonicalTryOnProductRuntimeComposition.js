const SESSION_METHODS = Object.freeze(['inspect', 'begin', 'resume', 'recover', 'retry', 'completeFinal', 'abandon', 'snapshot']);
const MANUAL_METHODS = Object.freeze(['loadGarmentSource', 'saveContour', 'saveBodyAnchors']);
const APPLICATION_METHODS = Object.freeze(['checkReadiness', 'begin', 'resume', 'recover']);

/**
 * Pure composition helper for the canonical deterministic Try-On product path.
 *
 * It deliberately returns only the product-session and manual-prerequisite
 * capabilities. The raw Fashion/Core client and prepared-execution application
 * remain private to this composition closure and are never exposed to React.
 */
export function composeCanonicalTryOnProductRuntime({
  selection,
  fashion,
  randomUUID,
  createBrowserApplication,
  createReadinessSelection,
  createProductSession,
  createManualApplication,
  createClientRequestId,
}) {
  requireObject(fashion, 'Fashion client');
  requireObject(fashion.garments, 'Managed Garment client');
  requireObject(fashion.wardrobe, 'Managed Wardrobe client');
  requireFunction(createBrowserApplication, 'createBrowserApplication');
  requireFunction(createReadinessSelection, 'createReadinessSelection');
  requireFunction(createProductSession, 'createProductSession');
  requireFunction(createManualApplication, 'createManualApplication');
  requireFunction(createClientRequestId, 'createClientRequestId');

  const application = createBrowserApplication({
    projectId: selection?.projectId,
    fashion,
  });
  requireMethods(application, APPLICATION_METHODS, 'canonical browser application');

  const readiness = createReadinessSelection({
    checkReadiness: application.checkReadiness,
  });
  requireMethods(readiness, ['inspect'], 'canonical readiness selection');

  const session = createProductSession({
    selection,
    readiness,
    application,
    createClientRequestId: () => createClientRequestId(randomUUID),
  });
  requireMethods(session, SESSION_METHODS, 'canonical product session');

  const manual = createManualApplication({
    garments: fashion.garments,
    wardrobe: fashion.wardrobe,
    fashion,
  });
  requireMethods(manual, MANUAL_METHODS, 'manual prerequisite application');

  return Object.freeze({ session, manual });
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Canonical Try-On runtime requires ${label}`);
  }
}

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError(`Canonical Try-On runtime requires ${label}`);
  }
}

function requireMethods(value, methods, label) {
  requireObject(value, label);
  for (const method of methods) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`Canonical Try-On runtime requires ${label}.${method}`);
    }
  }
}
