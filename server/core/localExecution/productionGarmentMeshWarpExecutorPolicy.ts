import type { LocalExecutionExecutorBinding } from '../../../src/platform/creative/canonical/localExecution.ts';
import { GARMENT_MESH_WARP_CAPABILITY } from '../../../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/GarmentMeshWarpRegistryDefinition.js';

/**
 * Explicit F4b.4 production executor admission leaf.
 *
 * The deterministic tool definition remains data-only. This module is the narrow
 * production-policy decision that admits exactly its reviewed executor tuple;
 * the aggregate production policy imports this record without recreating it.
 */
export const productionGarmentMeshWarpExecutors: readonly LocalExecutionExecutorBinding[] = Object.freeze([
  GARMENT_MESH_WARP_TOOL_DEFINITION.executor,
]);

export const productionGarmentMeshWarpExecutorsByCapability: Readonly<Record<string, readonly LocalExecutionExecutorBinding[]>> = Object.freeze({
  [GARMENT_MESH_WARP_CAPABILITY]: productionGarmentMeshWarpExecutors,
});
