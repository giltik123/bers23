/** Node/browser-safe immutable identity leaf for deterministic White Balance v1. */
/** @type {'white-balance'} */
export const WHITE_BALANCE_TOOL_ID = 'white-balance';
/** @type {'1'} */
export const WHITE_BALANCE_TOOL_VERSION = '1';
/** @type {'local:tool:white-balance:v1'} */
export const WHITE_BALANCE_CAPABILITY = 'local:tool:white-balance:v1';
/** @type {'WHITE_BALANCE'} */
export const WHITE_BALANCE_OPERATION = 'WHITE_BALANCE';
/** @type {'white-balance'} */
export const WHITE_BALANCE_STEP_ID = 'white-balance';

/**
 * temperatureQ8/tintQ8 are signed gain offsets expressed in 1/256 units.
 * They are deliberately relative controls, not Kelvin or CIE chromaticity claims.
 */
/** @type {-128} */
export const WHITE_BALANCE_MIN_TEMPERATURE_Q8 = -128;
/** @type {128} */
export const WHITE_BALANCE_MAX_TEMPERATURE_Q8 = 128;
/** @type {-64} */
export const WHITE_BALANCE_MIN_TINT_Q8 = -64;
/** @type {64} */
export const WHITE_BALANCE_MAX_TINT_Q8 = 64;
/** @type {8} */
export const WHITE_BALANCE_PARAMETER_FRACTION_BITS = 8;
/** @type {16} */
export const WHITE_BALANCE_GAIN_FIXED_POINT_BITS = 16;
/** @type {65536} */
export const WHITE_BALANCE_GAIN_FIXED_POINT_ONE = 65536;
/** @type {16384} */
export const WHITE_BALANCE_MAX_DIMENSION = 16384;
/** @type {16777216} */
export const WHITE_BALANCE_MAX_OUTPUT_PIXELS = 16777216;
