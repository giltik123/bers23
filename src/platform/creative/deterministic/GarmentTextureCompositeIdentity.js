/**
 * Browser/Node-safe immutable identity for the F4b.5 deterministic garment
 * texture/edge/composite substrate.
 *
 * F4b.5a establishes reviewed shared pixel math only. Production execution is
 * deliberately NOT_ADMITTED until the later Core ticket/recompute/persistence
 * slice binds exact Project + Fashion evidence.
 */
/** @type {'garment-texture-composite'} */
export const GARMENT_TEXTURE_COMPOSITE_TOOL_ID = 'garment-texture-composite';
/** @type {'1'} */
export const GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION = '1';
/** @type {'GARMENT_TEXTURE_COMPOSITE'} */
export const GARMENT_TEXTURE_COMPOSITE_OPERATION = 'GARMENT_TEXTURE_COMPOSITE';
/** @type {'garment-texture-composite'} */
export const GARMENT_TEXTURE_COMPOSITE_STEP_ID = 'garment-texture-composite';
/** @type {'local:tool:garment-texture-composite:v1'} */
export const GARMENT_TEXTURE_COMPOSITE_CAPABILITY = 'local:tool:garment-texture-composite:v1';
/** @type {'BERS_GARMENT_TEXTURE_COMPOSITE_Q16_V1'} */
export const GARMENT_TEXTURE_COMPOSITE_SCHEMA = 'BERS_GARMENT_TEXTURE_COMPOSITE_Q16_V1';
/** @type {16} */
export const GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_BITS = 16;
/** @type {4096} */
export const GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION = 4096;
/** @type {8388608} */
export const GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS = 8_388_608;
/** @type {64} */
export const GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS = 64;
/** @type {4096} */
export const GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16 = 4_096;
/** @type {1048576} */
export const GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16 = 1_048_576;
/** @type {1048576} */
export const GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16 = 1_048_576;
/** @type {'CLAMP'} */
export const GARMENT_TEXTURE_COMPOSITE_WRAP_MODE = 'CLAMP';
/** @type {'PRESERVE_BASE_ALPHA'} */
export const GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY = 'PRESERVE_BASE_ALPHA';
/** @type {'SRGB_GAMMA_ENCODED_RGBA8'} */
export const GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY = 'SRGB_GAMMA_ENCODED_RGBA8';
/** @type {'NOT_ADMITTED' | 'ADMITTED'} */
export const GARMENT_TEXTURE_COMPOSITE_PRODUCTION_ADMISSION = 'NOT_ADMITTED';
