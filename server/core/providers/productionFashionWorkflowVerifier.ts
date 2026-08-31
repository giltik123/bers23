import type { WorkflowVerifierPort } from '../../../src/platform/creative/workflow-engine/types.ts';
import { GARMENT_MESH_WARP_OPERATION } from '../../../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import { productionWorkflowVerifier } from './productionWorkflowVerifier.ts';
import { verifyGarmentMeshWarpWorkingArtifact } from './garmentMeshWarpWorkflowVerifier.ts';

/**
 * Narrow verifier composition for Fashion F4b.4.
 * Existing production operations delegate unchanged to the established verifier;
 * only GARMENT_MESH_WARP is intercepted for the strict WORKING-intermediate law.
 * This object grants no execution capability or route by itself.
 */
export const productionFashionWorkflowVerifier: WorkflowVerifierPort = Object.freeze({
  verify(operation, artifacts) {
    if (operation.type === GARMENT_MESH_WARP_OPERATION) return Promise.resolve(verifyGarmentMeshWarpWorkingArtifact(operation, artifacts));
    return productionWorkflowVerifier.verify(operation, artifacts);
  },
});
