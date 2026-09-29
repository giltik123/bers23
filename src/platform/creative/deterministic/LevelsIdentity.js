/** Node/browser-safe immutable identity leaf for deterministic Levels v1. */
/** @type {'levels'} */
export const LEVELS_TOOL_ID = 'levels';
/** @type {'1'} */
export const LEVELS_TOOL_VERSION = '1';
/** @type {'local:tool:levels:v1'} */
export const LEVELS_CAPABILITY = 'local:tool:levels:v1';
/** @type {'LEVELS'} */
export const LEVELS_OPERATION = 'LEVELS';
/** @type {'levels'} */
export const LEVELS_STEP_ID = 'levels';

/**
 * Levels v1 is an exact piecewise-linear display-referred tonal remap.
 * The input midpoint is mapped to the integer midpoint of the output range.
 * This is deliberately not a floating gamma/power-curve contract.
 */
/** @type {0} */
export const LEVELS_MIN_INPUT_BLACK = 0;
/** @type {253} */
export const LEVELS_MAX_INPUT_BLACK = 253;
/** @type {1} */
export const LEVELS_MIN_INPUT_MIDPOINT = 1;
/** @type {254} */
export const LEVELS_MAX_INPUT_MIDPOINT = 254;
/** @type {2} */
export const LEVELS_MIN_INPUT_WHITE = 2;
/** @type {255} */
export const LEVELS_MAX_INPUT_WHITE = 255;
/** @type {0} */
export const LEVELS_MIN_OUTPUT_BLACK = 0;
/** @type {254} */
export const LEVELS_MAX_OUTPUT_BLACK = 254;
/** @type {1} */
export const LEVELS_MIN_OUTPUT_WHITE = 1;
/** @type {255} */
export const LEVELS_MAX_OUTPUT_WHITE = 255;
/** @type {16384} */
export const LEVELS_MAX_DIMENSION = 16384;
/** @type {16777216} */
export const LEVELS_MAX_OUTPUT_PIXELS = 16777216;
