import {
  EXPOSURE_MAX_DIMENSION,
  EXPOSURE_MAX_EIGHTH_STOPS,
  EXPOSURE_MAX_OUTPUT_PIXELS,
  EXPOSURE_MIN_EIGHTH_STOPS,
} from './ExposureIdentity.js';

/** Node/browser-safe immutable identity leaf for deterministic Masked Exposure v1. */
/** @type {'masked-exposure'} */
export const MASKED_EXPOSURE_TOOL_ID = 'masked-exposure';
/** @type {'1'} */
export const MASKED_EXPOSURE_TOOL_VERSION = '1';
/** @type {'local:tool:masked-exposure:v1'} */
export const MASKED_EXPOSURE_CAPABILITY = 'local:tool:masked-exposure:v1';
/** @type {'MASKED_EXPOSURE'} */
export const MASKED_EXPOSURE_OPERATION = 'MASKED_EXPOSURE';
/** @type {'masked-exposure'} */
export const MASKED_EXPOSURE_STEP_ID = 'masked-exposure';
/** @type {-32} */
export const MASKED_EXPOSURE_MIN_EIGHTH_STOPS = EXPOSURE_MIN_EIGHTH_STOPS;
/** @type {32} */
export const MASKED_EXPOSURE_MAX_EIGHTH_STOPS = EXPOSURE_MAX_EIGHTH_STOPS;
/** @type {16384} */
export const MASKED_EXPOSURE_MAX_DIMENSION = EXPOSURE_MAX_DIMENSION;
/** @type {16777216} */
export const MASKED_EXPOSURE_MAX_PIXELS = EXPOSURE_MAX_OUTPUT_PIXELS;
/** @type {67108864} */
export const MASKED_EXPOSURE_MAX_WORK = EXPOSURE_MAX_OUTPUT_PIXELS * 4;
