import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng.ts';
import { createCanonicalTryOnEditorController } from './createCanonicalTryOnEditorController.js';
import { createCanonicalTryOnEditorUiOwner } from './canonicalTryOnEditorUiOwner.js';
import { createCanonicalTryOnProductRuntime } from './createCanonicalTryOnProductRuntime.js';
import { createTryOnEditorFinalHandoff } from './createTryOnEditorFinalHandoff.js';

/**
 * Production browser composition root for the Editor-owned canonical Try-On UI.
 *
 * React supplies only UI lifecycle callbacks. Runtime/controller construction,
 * deterministic PNG handoff and object-URL creation remain below this boundary.
 */
export function createCanonicalTryOnBrowserEditorUiOwner({
  getProject,
  publishPendingResult,
  disposePendingPreview,
  onStateChange,
  reportError,
}) {
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

  return createCanonicalTryOnEditorUiOwner({
    getProject,
    publishPendingResult,
    disposePendingPreview,
    onStateChange,
    reportError,
    createController: ({ selection, beforeUrl }) => createCanonicalTryOnEditorController({
      selection,
      beforeUrl,
      createRuntime: createCanonicalTryOnProductRuntime,
      handoff,
    }),
  });
}
