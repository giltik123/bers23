/**
 * Node/browser-safe immutable identity leaf for the F4b deterministic garment mesh warp kernel.
 *
 * This identity is intentionally NOT a production local-execution capability. F4b.1 only
 * establishes shared deterministic pixel math. Managed Garment input binding and Core ticket
 * admission must land separately before this tool can enter production executor policy.
 */
/** @type {'garment-mesh-warp'} */
export const GARMENT_MESH_WARP_TOOL_ID = 'garment-mesh-warp';
/** @type {'1'} */
export const GARMENT_MESH_WARP_TOOL_VERSION = '1';
/** @type {'GARMENT_MESH_WARP'} */
export const GARMENT_MESH_WARP_OPERATION = 'GARMENT_MESH_WARP';
/** @type {'BERS_GARMENT_MESH_WARP_Q16_V1'} */
export const GARMENT_MESH_WARP_SCHEMA = 'BERS_GARMENT_MESH_WARP_Q16_V1';
/** @type {16} */
export const GARMENT_MESH_WARP_FIXED_POINT_BITS = 16;
/** @type {4096} */
export const GARMENT_MESH_WARP_MAX_DIMENSION = 4096;
/** @type {8388608} */
export const GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS = 8_388_608;
/** @type {4096} */
export const GARMENT_MESH_WARP_MAX_POINTS = 4096;
/** @type {8192} */
export const GARMENT_MESH_WARP_MAX_TRIANGLES = 8192;
/** @type {'NOT_ADMITTED'} */
export const GARMENT_MESH_WARP_PRODUCTION_ADMISSION = 'NOT_ADMITTED';
