import {
  LEVELS_MAX_DIMENSION,
  LEVELS_MAX_INPUT_BLACK,
  LEVELS_MAX_INPUT_MIDPOINT,
  LEVELS_MAX_INPUT_WHITE,
  LEVELS_MAX_OUTPUT_BLACK,
  LEVELS_MAX_OUTPUT_PIXELS,
  LEVELS_MAX_OUTPUT_WHITE,
  LEVELS_MIN_INPUT_BLACK,
  LEVELS_MIN_INPUT_MIDPOINT,
  LEVELS_MIN_INPUT_WHITE,
  LEVELS_MIN_OUTPUT_BLACK,
  LEVELS_MIN_OUTPUT_WHITE,
} from './LevelsIdentity.js';

/** Node/browser-safe immutable identity leaf for deterministic Masked Levels v1. */
/** @type {'masked-levels'} */
export const MASKED_LEVELS_TOOL_ID = 'masked-levels';
/** @type {'1'} */
export const MASKED_LEVELS_TOOL_VERSION = '1';
/** @type {'local:tool:masked-levels:v1'} */
export const MASKED_LEVELS_CAPABILITY = 'local:tool:masked-levels:v1';
/** @type {'MASKED_LEVELS'} */
export const MASKED_LEVELS_OPERATION = 'MASKED_LEVELS';
/** @type {'masked-levels'} */
export const MASKED_LEVELS_STEP_ID = 'masked-levels';

/** @type {0} */
export const MASKED_LEVELS_MIN_INPUT_BLACK = LEVELS_MIN_INPUT_BLACK;
/** @type {253} */
export const MASKED_LEVELS_MAX_INPUT_BLACK = LEVELS_MAX_INPUT_BLACK;
/** @type {1} */
export const MASKED_LEVELS_MIN_INPUT_MIDPOINT = LEVELS_MIN_INPUT_MIDPOINT;
/** @type {254} */
export const MASKED_LEVELS_MAX_INPUT_MIDPOINT = LEVELS_MAX_INPUT_MIDPOINT;
/** @type {2} */
export const MASKED_LEVELS_MIN_INPUT_WHITE = LEVELS_MIN_INPUT_WHITE;
/** @type {255} */
export const MASKED_LEVELS_MAX_INPUT_WHITE = LEVELS_MAX_INPUT_WHITE;
/** @type {0} */
export const MASKED_LEVELS_MIN_OUTPUT_BLACK = LEVELS_MIN_OUTPUT_BLACK;
/** @type {254} */
export const MASKED_LEVELS_MAX_OUTPUT_BLACK = LEVELS_MAX_OUTPUT_BLACK;
/** @type {1} */
export const MASKED_LEVELS_MIN_OUTPUT_WHITE = LEVELS_MIN_OUTPUT_WHITE;
/** @type {255} */
export const MASKED_LEVELS_MAX_OUTPUT_WHITE = LEVELS_MAX_OUTPUT_WHITE;
/** @type {16384} */
export const MASKED_LEVELS_MAX_DIMENSION = LEVELS_MAX_DIMENSION;
/** @type {16777216} */
export const MASKED_LEVELS_MAX_PIXELS = LEVELS_MAX_OUTPUT_PIXELS;
/** @type {67108864} */
export const MASKED_LEVELS_MAX_WORK = LEVELS_MAX_OUTPUT_PIXELS * 4;
