/** @type {'bers.affine-transform.rgba8'} */
export const AFFINE_TRANSFORM_TOOL_ID = 'bers.affine-transform.rgba8';
/** @type {'1'} */
export const AFFINE_TRANSFORM_TOOL_VERSION = '1';
/** @type {'local:tool:affine-transform:v1'} */
export const AFFINE_TRANSFORM_CAPABILITY = 'local:tool:affine-transform:v1';
/** @type {'AFFINE_TRANSFORM'} */
export const AFFINE_TRANSFORM_OPERATION = 'AFFINE_TRANSFORM';
/** @type {'affine-transform'} */
export const AFFINE_TRANSFORM_STEP_ID = 'affine-transform';

export const AFFINE_FIXED_POINT_BITS = 16;
export const AFFINE_FIXED_POINT_ONE = 2 ** AFFINE_FIXED_POINT_BITS;
export const AFFINE_MAX_DIMENSION = 8192;
export const AFFINE_MAX_OUTPUT_PIXELS = 16_777_216;
export const AFFINE_MAX_LINEAR_COEFFICIENT_ABS = 8 * AFFINE_FIXED_POINT_ONE;
export const AFFINE_MAX_TRANSLATION_ABS = 16_384 * AFFINE_FIXED_POINT_ONE;
