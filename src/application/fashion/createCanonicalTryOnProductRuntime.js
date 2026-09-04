import { coreClient } from '../../api/coreClient.js';
import { createFashionTryOnClientRequestId } from './canonicalTryOnApplication.js';
import { createCanonicalTryOnBrowserApplication } from './createCanonicalTryOnBrowserApplication.js';
import { createCanonicalTryOnManualPrerequisiteApplication } from './createCanonicalTryOnManualPrerequisiteApplication.js';
import { createCanonicalTryOnProductSession } from './createCanonicalTryOnProductSession.js';
import { createCanonicalTryOnReadinessSelection } from './createCanonicalTryOnReadinessSelection.js';
import { composeCanonicalTryOnProductRuntime } from './canonicalTryOnProductRuntimeComposition.js';

/**
 * Production browser composition root for canonical deterministic Try-On.
 *
 * React receives only the safe runtime returned by the pure composition helper:
 * an ephemeral product session plus manual-prerequisite capabilities. Raw Core
 * clients and prepared local executors remain encapsulated below this boundary.
 */
export function createCanonicalTryOnProductRuntime({
  selection,
  fashion = coreClient.fashion,
  randomUUID,
} = {}) {
  return composeCanonicalTryOnProductRuntime({
    selection,
    fashion,
    randomUUID,
    createBrowserApplication: createCanonicalTryOnBrowserApplication,
    createReadinessSelection: createCanonicalTryOnReadinessSelection,
    createProductSession: createCanonicalTryOnProductSession,
    createManualApplication: createCanonicalTryOnManualPrerequisiteApplication,
    createClientRequestId: createFashionTryOnClientRequestId,
  });
}
