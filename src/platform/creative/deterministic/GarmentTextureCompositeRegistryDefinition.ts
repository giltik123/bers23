import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FEATHER_DISTANCE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_BITS,
  GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS,
  GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16,
  GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16,
  GARMENT_TEXTURE_COMPOSITE_OPERATION,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_STEP_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
  GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_OUTPUT_RGB_POLICY,
  GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_SAMPLE_RGB_POLICY,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
} from './GarmentTextureCompositeIdentity.js';

/**
 * Data-only F4b.5b deterministic tool contract.
 *
 * Kept outside the registry implementation so the complete reviewed Fashion
 * pixel/lineage law can be inspected without granting production capability.
 * Importing this object does not register or admit the tool.
 */
export const GARMENT_TEXTURE_COMPOSITE_TOOL_DEFINITION_DATA = Object.freeze({
  capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  operation: Object.freeze({
    id: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    type: GARMENT_TEXTURE_COMPOSITE_OPERATION,
    version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
  }),
  executor: Object.freeze({
    kind: 'DETERMINISTIC_TOOL' as const,
    toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
    version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
  }),
  inputs: Object.freeze([
    Object.freeze({
      name: 'projectSource',
      kind: 'image',
      roles: Object.freeze(['ORIGINAL', 'COMPOSITE'] as const),
      sha256: 'REQUIRED' as const,
      geometry: 'SOURCE' as const,
    }),
  ]),
  managedInputs: Object.freeze([
    Object.freeze({
      name: 'basisView',
      authority: 'MANAGED_GARMENT' as const,
      kind: 'GARMENT_VIEW' as const,
      sha256: 'REQUIRED' as const,
      use: 'PIXEL_SOURCE' as const,
      contentType: 'image/png' as const,
      encoding: 'PNG_RGBA8_LOSSLESS' as const,
    }),
    Object.freeze({
      name: 'representation',
      authority: 'MANAGED_GARMENT' as const,
      kind: 'GARMENT_REPRESENTATION' as const,
      sha256: 'REQUIRED' as const,
      use: 'GEOMETRY_AUTHORITY' as const,
      contentType: 'application/vnd.bers.garment-parametric+json' as const,
      tier: 'PARAMETRIC' as const,
      format: 'BERS_PARAMETRIC_V1' as const,
    }),
  ]),
  output: Object.freeze({
    kind: 'image',
    role: 'COMPOSITE' as const,
    count: 1 as const,
    mimeTypes: Object.freeze(['image/png'] as const),
    geometry: 'PROJECT_SOURCE_DIMENSIONS' as const,
  }),
  parameters: Object.freeze({
    artifactIdBindings: Object.freeze([
      Object.freeze({ parameter: 'sourceArtifactId', input: 'projectSource' }),
    ]),
    managedIdBindings: Object.freeze([
      Object.freeze({ parameter: 'garmentId', input: 'basisView', field: 'garmentId' as const }),
      Object.freeze({ parameter: 'viewId', input: 'basisView', field: 'viewId' as const }),
      Object.freeze({ parameter: 'representationId', input: 'representation', field: 'representationId' as const }),
      Object.freeze({ parameter: 'viewId', input: 'representation', field: 'basisViewId' as const }),
    ]),
    exact: Object.freeze({
      deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`,
      compositeSchema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
      fixedPointBits: GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_BITS,
      wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
      alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
      transparentSampleRgbPolicy: GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_SAMPLE_RGB_POLICY,
      featherDistancePolicy: GARMENT_TEXTURE_COMPOSITE_FEATHER_DISTANCE_POLICY,
      transparentOutputRgbPolicy: GARMENT_TEXTURE_COMPOSITE_TRANSPARENT_OUTPUT_RGB_POLICY,
      colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
      maxFeatherRadius: GARMENT_TEXTURE_COMPOSITE_MAX_FEATHER_RADIUS,
      minScaleQ16: GARMENT_TEXTURE_COMPOSITE_MIN_SCALE_Q16,
      maxScaleQ16: GARMENT_TEXTURE_COMPOSITE_MAX_SCALE_Q16,
      maxOffsetAbsQ16: GARMENT_TEXTURE_COMPOSITE_MAX_OFFSET_ABS_Q16,
      maxOutputPixels: GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
      geometryEvidence: 'IMMUTABLE_F4B4_LAYER_RECOMPUTED_FROM_CURRENT_AUTHORITIES',
      compositing: 'PORTER_DUFF_SOURCE_OVER_SRGB_GAMMA_ENCODED_RGBA8',
    }),
    relationships: Object.freeze(['REPRESENTATION_BASIS_VIEW_EQUALS_PIXEL_SOURCE_VIEW'] as const),
  }),
  browser: Object.freeze({
    executorId: 'garment-texture-composite-rgba8-browser-v1',
    runtime: 'BROWSER_JS' as const,
    accelerator: 'cpu' as const,
  }),
  verification: Object.freeze({
    verifierId: 'garment-texture-composite-rgba8-core-v1',
    comparison: 'BYTE_EXACT_CORE_RECOMPUTE' as const,
  }),
  pixelContract: Object.freeze({
    format: 'RGBA8' as const,
    colorSpace: 'srgb' as const,
    orientation: 1 as const,
    rgb: 'TEXTURE_MAP_WARP_FEATHER_SOURCE_OVER' as const,
    alpha: 'TEXTURE_PRESERVE_WARP_FEATHER_SOURCE_OVER' as const,
    interpolation: 'BILINEAR_NORMALIZED_Q16_TEXTURE_AND_MESH' as const,
    rounding: 'ROUND_HALF_UP' as const,
    border: 'CLAMP_TO_EDGE' as const,
    transparentRgb: 'PRESERVE_BASE_RGB_ON_TRANSPARENT_TEXTURE_SAMPLE_AND_ZERO_FINAL_WHEN_ALPHA_ZERO' as const,
    overlapOwnership: 'DECLARED_TRIANGLE_ORDER_FIRST_OWNER' as const,
  }),
  resourcePolicy: Object.freeze({
    enforcement: 'CORE_CONFIG_AND_TICKET' as const,
    dimensions: 'CORE_IMAGE_MAX_DIMENSION' as const,
    pixels: 'CORE_IMAGE_MAX_PIXELS' as const,
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES' as const,
    hardOutputPixels: 'GARMENT_TEXTURE_COMPOSITE_V1_MAX_OUTPUT_PIXELS' as const,
    maxRasterWork: 'GARMENT_MESH_WARP_V1_MAX_RASTER_WORK' as const,
  }),
  lineage: Object.freeze({
    parentInputs: Object.freeze(['projectSource'] as const),
    managedParents: Object.freeze(['basisView', 'representation'] as const),
    finalRole: 'COMPOSITE' as const,
    producerOperation: GARMENT_TEXTURE_COMPOSITE_OPERATION,
  }),
});
