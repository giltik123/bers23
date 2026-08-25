export const SUPER_RESOLUTION_OPERATION = 'SUPER_RESOLUTION' as const;
export const SUPER_RESOLUTION_OPERATION_INTENT = 'SUPER_RESOLUTION' as const;
export const SUPER_RESOLUTION_STEP_ID = 'super-resolution' as const;
export const REAL_ESRGAN_UPSCALE_CAPABILITY = 'local:realesrgan:upscale:v1' as const;
export const SUPER_RESOLUTION_SCALE = 4 as const;
export const SUPER_RESOLUTION_ALPHA_POLICY = 'OPAQUE_INPUT_ONLY' as const;

/**
 * Absolute v1 full-frame allocation ceiling, not a production-device suitability
 * claim. Real-device benchmark policy may impose a lower limit; a future tiled
 * executor may change the input strategy but must still bound final allocation.
 */
export const MAX_SUPER_RESOLUTION_OUTPUT_PIXELS = 16_777_216 as const;
