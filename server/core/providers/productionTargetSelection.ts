import type { TargetSelectorPort } from '../../../src/platform/creative/canonical/contracts.ts';
import { GARMENT_TEXTURE_COMPOSITE_OPERATION } from '../../../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import { GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE } from './productionGarmentMeshWarpExecutionPolicy.ts';

export const PRODUCTION_TARGET_SELECTION_VERSION = '6.42F4B5B';
/** Pure target policy; BLOCKED is the fail-closed default. */
export const productionTargetSelection: TargetSelectorPort = Object.freeze({
  select(operation) {
    if (operation.type === 'image-edit' || operation.type === 'CONTROLLED_LOCAL_EDIT') return 'CLOUD';
    if (operation.type === 'verify' || operation.type === 'segment' || operation.type === 'BACKGROUND_ISOLATION' || operation.type === 'CROP' || operation.type === 'RESIZE' || operation.type === 'ORTHOGONAL_TRANSFORM' || operation.type === GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE.operationType || operation.type === GARMENT_TEXTURE_COMPOSITE_OPERATION || operation.type === 'SUPER_RESOLUTION') return 'LOCAL';
    return 'BLOCKED';
  },
});
