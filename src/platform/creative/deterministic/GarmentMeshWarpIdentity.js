/**
 * Node/browser-safe immutable identity leaf for the F4b deterministic garment mesh warp kernel.
 *
 * F4b.1 established shared deterministic pixel math. F4b.4 production admission is
 * intentionally explicit: these identifiers may be referenced by the canonical
 * ticket/executor fabric before GARMENT_MESH_WARP_PRODUCTION_ADMISSION flips to
 * ADMITTED, but the identity module itself grants no execution authority.
 */
/** @type {'garment-mesh-warp'} */
export const GARMENT_MESH_WARP_TOOL_ID = 'garment-mesh-warp';
/** @type {'1'} */
export const GARMENT_MESH_WARP_TOOL_VERSION = '1';
/** @type {'GARMENT_MESH_WARP'} */
export const GARMENT_MESH_WARP_OPERATION = 'GARMENT_MESH_WARP';
/** @type {'garment-mesh-warp'} */
export const GARMENT_MESH_WARP_STEP_ID = 'garment-mesh-warp';
/** @type {'local:tool:garment-mesh-warp:v1'} */
export const GARMENT_MESH_WARP_CAPABILITY = 'local:tool:garment-mesh-warp:v1';
/** @type {'BERS_GARMENT_MESH_WARP_Q16_V1'} */
export const GARMENT_MESH_WARP_SCHEMA = 'BERS_GARMENT_MESH_WARP_Q16_V1';
/** @type {16} */
export const GARMENT_MESH_WARP_FIXED_POINT_BITS = 16;
/** @type {4096} */
export const GARMENT_MESH_WARP_MAX_DIMENSION = 4096;
/** @type {8388608} */
export const GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS = 8_388_608;
/** Maximum aggregate destination-triangle bounding-box pixel checks per execution. */
/** @type {33554432} */
export const GARMENT_MESH_WARP_MAX_RASTER_WORK = 33_554_432;
/** @type {4096} */
export const GARMENT_MESH_WARP_MAX_POINTS = 4096;
/** @type {8192} */
export const GARMENT_MESH_WARP_MAX_TRIANGLES = 8192;
/** @type {'NOT_ADMITTED' | 'ADMITTED'} */
export const GARMENT_MESH_WARP_PRODUCTION_ADMISSION = 'ADMITTED';
