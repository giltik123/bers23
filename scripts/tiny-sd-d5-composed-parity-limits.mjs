export const D5_COMPOSED_PARITY_ADMISSION_POLICY =
  'PINNED_STAGE_FAMILY_NORMALIZED_LIMITS_FROM_TWO_REAL_CHROME_SAMPLES';

export const D5_COMPOSED_PARITY_CALIBRATION = Object.freeze({
  sampleRunIds: Object.freeze([32921222867, 32926052529]),
  sampleHeadShas: Object.freeze([
    'fe18a3842cae94b79892b94bd18880ecb681a63d',
    'f17e9789fbcc032d44ab50ef5b06acbe596df748',
  ]),
  sampleRequirement: 'TWO_INDEPENDENT_EXACT_HEAD_REAL_CHROME_WASM_SAMPLES',
  browserRerunRequirement: 'TWO_PASSES_EXACT_STAGE_HASHES_AND_PARITY_METRICS',
  minHeadroomRatio: 1.2,
  maxHeadroomRatio: 2.0,
  minimumNarrowingVsD3Envelope: 10,
  d3Envelope: Object.freeze({ maxAbs: 0.02, rmse: 0.01 }),
});


export const D5_D3_EXACT_HEAD_COMPONENT_ERROR_CONTEXT = Object.freeze({
  runId: 32926052575,
  headSha: 'f17e9789fbcc032d44ab50ef5b06acbe596df748',
  source: 'REAL_CHROME_WASM_COMPONENT_ISOLATION',
  components: Object.freeze({
  "text_encoder": {
    "maxAbs": 6.253741400201855e-07,
    "rmse": 2.0309091664198394e-06
  },
  "unet": {
    "maxAbs": 6.772419097478217e-06,
    "rmse": 9.707049645937498e-06
  },
  "vae_decoder": {
    "maxAbs": 0.0017735800154948145,
    "rmse": 0.0010294491377003776
  }
}),
});

export const D5_D3_SELECTED_GRAPH_FINGERPRINTS = Object.freeze({
  "text_encoder": "bc9b9c83740753cda24e28a7c3ec806f38b647314f3aba4e02a24d2ed9a9cca4",
  "unet": "65c40fb712c2e2fadadc33e1a9c7be5a97c3f9a86dfba463da9ce6a3e5bc1e9a",
  "vae_decoder": "ad661bf790bc1024710e97bfbf2f0285c7f9e6cf87b9d3ad33530f41d0ffd2e7"
});

export const D5_COMPOSED_PARITY_OBSERVED_WORST = Object.freeze({
  "textConditional": {
    "maxAbs": 6.940296332145926e-07,
    "rmse": 5.491117982619489e-07
  },
  "textUnconditional": {
    "maxAbs": 3.238804955001432e-06,
    "rmse": 7.588736722502003e-07
  },
  "unetUnconditional": {
    "maxAbs": 0.00014863686508569332,
    "rmse": 3.8241974903832666e-05
  },
  "unetConditional": {
    "maxAbs": 0.0001496809720132461,
    "rmse": 3.659715622638277e-05
  },
  "guidedNoise": {
    "maxAbs": 0.00015919485965442927,
    "rmse": 6.455245454094151e-05
  },
  "latentSteps": {
    "maxAbs": 0.00013108966878142968,
    "rmse": 0.00018682671005874158
  },
  "finalDecoded": {
    "maxAbs": 0.0015809588773531792,
    "rmse": 0.0002651346834997376
  },
  "finalImage01": {
    "maxAbs": 0.0008457303047180176,
    "rmse": 0.0001373380492594989
  }
});

export const D5_COMPOSED_PARITY_LIMITS = Object.freeze({
  "textConditional": {
    "maxAbs": 1e-06,
    "rmse": 8e-07
  },
  "textUnconditional": {
    "maxAbs": 5e-06,
    "rmse": 1e-06
  },
  "unetUnconditional": {
    "maxAbs": 0.0002,
    "rmse": 5e-05
  },
  "unetConditional": {
    "maxAbs": 0.0002,
    "rmse": 5e-05
  },
  "guidedNoise": {
    "maxAbs": 0.0002,
    "rmse": 8e-05
  },
  "latentSteps": {
    "maxAbs": 0.0002,
    "rmse": 0.00025
  },
  "finalDecoded": {
    "maxAbs": 0.002,
    "rmse": 0.00035
  },
  "finalImage01": {
    "maxAbs": 0.0011,
    "rmse": 0.00018
  }
});
