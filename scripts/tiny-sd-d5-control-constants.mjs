export const D5_CONTROL_AUTHORITY = 'COMPOSITION_ONLY_NOT_QUALITY_ADMISSION';

// Calibrated from the first exact-head JS-vs-diffusers==0.19.0 run:
// observed maxAbs=5.7220458984375e-6, RMSE=3.5625950507042753e-6.
// This is a scheduler-control tolerance only; it is not a model-output tolerance.
export const D5_DPM_PARITY_LIMIT = Object.freeze({ maxAbs: 8e-6, rmse: 5e-6 });

export const D5_TRANSFORMERS_JS_VERSION = '3.8.1';
