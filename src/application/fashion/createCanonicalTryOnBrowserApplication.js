import { coreClient } from '../../api/coreClient.js';
import { createCanonicalTryOnApplication } from './canonicalTryOnApplication.js';
import {
  CorePreparedGarmentMeshWarp,
  CorePreparedGarmentTextureComposite,
} from '../local-execution/CorePreparedFashionTryOn';

const PROJECT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Browser composition root for deterministic Fashion Try-On.
 *
 * The UI receives only the high-level canonical application API. Prepared
 * ticket lookup, bounded input delivery, deterministic PNG generation and
 * candidate submission remain encapsulated in the already-admitted executors.
 */
export function createCanonicalTryOnBrowserApplication({
  projectId,
  fashion = coreClient.fashion,
  clock,
} = {}) {
  const canonicalProjectId = requireProjectId(projectId);
  requireFashionClient(fashion);

  const mesh = new CorePreparedGarmentMeshWarp(
    canonicalProjectId,
    Object.freeze({
      loadPreparedGarmentMeshWarpInput: (payload) => fashion.loadTryOnWarpInput(payload),
      submitPreparedGarmentMeshWarpCandidate: (payload) => fashion.submitTryOnWarpCandidate(payload),
    }),
    clock,
  );
  const texture = new CorePreparedGarmentTextureComposite(
    canonicalProjectId,
    Object.freeze({
      loadPreparedGarmentTextureCompositeInput: (payload) => fashion.loadTryOnTextureInput(payload),
      submitPreparedGarmentTextureCompositeCandidate: (payload) => fashion.submitTryOnTextureCandidate(payload),
    }),
    clock,
  );

  return createCanonicalTryOnApplication({
    core: Object.freeze({
      checkTryOnReadiness: (payload) => fashion.checkTryOnReadiness(payload),
      prepareTryOn: (payload) => fashion.prepareTryOn(payload),
      continueTryOn: (payload) => fashion.continueTryOn(payload),
      getTryOnResult: (payload) => fashion.getTryOnResult(payload),
      getTryOnPreview: (payload) => fashion.getTryOnPreview(payload),
    }),
    executeWarp: ({ projectId: executionProjectId, preparedExecution }) => {
      assertExecutionProject(canonicalProjectId, executionProjectId);
      return mesh.run(preparedExecution);
    },
    executeTexture: ({ projectId: executionProjectId, preparedExecution }) => {
      assertExecutionProject(canonicalProjectId, executionProjectId);
      return texture.run(preparedExecution);
    },
  });
}

function requireProjectId(value) {
  if (typeof value !== 'string' || !PROJECT_UUID.test(value)) {
    throw new TypeError('Canonical Try-On browser application requires a lowercase Project UUID');
  }
  return value;
}

function assertExecutionProject(expected, actual) {
  if (actual !== expected) throw new Error('Prepared Try-On execution escaped its bound Project');
}

function requireFashionClient(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Canonical Try-On browser application requires the Fashion Core client');
  }
  for (const method of [
    'checkTryOnReadiness', 'prepareTryOn', 'continueTryOn', 'getTryOnResult', 'getTryOnPreview',
    'loadTryOnWarpInput', 'submitTryOnWarpCandidate', 'loadTryOnTextureInput', 'submitTryOnTextureCandidate',
  ]) {
    if (typeof value[method] !== 'function') throw new TypeError(`Fashion Core client is missing ${method}`);
  }
}
