import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_FIXED_POINT_BITS,
  GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS,
  GARMENT_MESH_WARP_MAX_RASTER_WORK,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_SCHEMA,
  GARMENT_MESH_WARP_STEP_ID,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from './GarmentMeshWarpIdentity.js';

/**
 * Data-only F4b.4 deterministic tool contract.
 *
 * Kept outside the aggregate registry so GarmentMeshWarp-specific runtime and
 * acceptance paths do not inherit unrelated deterministic-tool dependencies.
 * The aggregate registry imports and re-exports this exact frozen object; this
 * module grants no production capability by itself.
 *
 * @type {import('./DeterministicToolRegistry.ts').DeterministicToolDefinition}
 */
export const GARMENT_MESH_WARP_TOOL_DEFINITION_DATA = Object.freeze({
  capability: GARMENT_MESH_WARP_CAPABILITY,
  operation: Object.freeze({
    id: GARMENT_MESH_WARP_STEP_ID,
    type: GARMENT_MESH_WARP_OPERATION,
    version: GARMENT_MESH_WARP_TOOL_VERSION,
  }),
  executor: Object.freeze({
    kind: 'DETERMINISTIC_TOOL',
    toolId: GARMENT_MESH_WARP_TOOL_ID,
    version: GARMENT_MESH_WARP_TOOL_VERSION,
  }),
  inputs: Object.freeze([
    Object.freeze({
      name: 'projectSource',
      kind: 'image',
      roles: Object.freeze(['ORIGINAL', 'COMPOSITE']),
      sha256: 'REQUIRED',
      geometry: 'SOURCE',
    }),
  ]),
  managedInputs: Object.freeze([
    Object.freeze({
      name: 'basisView',
      authority: 'MANAGED_GARMENT',
      kind: 'GARMENT_VIEW',
      sha256: 'REQUIRED',
      use: 'PIXEL_SOURCE',
      contentType: 'image/png',
      encoding: 'PNG_RGBA8_LOSSLESS',
    }),
    Object.freeze({
      name: 'representation',
      authority: 'MANAGED_GARMENT',
      kind: 'GARMENT_REPRESENTATION',
      sha256: 'REQUIRED',
      use: 'GEOMETRY_AUTHORITY',
      contentType: 'application/vnd.bers.garment-parametric+json',
      tier: 'PARAMETRIC',
      format: 'BERS_PARAMETRIC_V1',
    }),
  ]),
  output: Object.freeze({
    kind: 'image',
    role: 'WORKING',
    count: 1,
    mimeTypes: Object.freeze(['image/png']),
    geometry: 'PROJECT_SOURCE_DIMENSIONS',
  }),
  parameters: Object.freeze({
    artifactIdBindings: Object.freeze([
      Object.freeze({ parameter: 'sourceArtifactId', input: 'projectSource' }),
    ]),
    managedIdBindings: Object.freeze([
      Object.freeze({ parameter: 'garmentId', input: 'basisView', field: 'garmentId' }),
      Object.freeze({ parameter: 'viewId', input: 'basisView', field: 'viewId' }),
      Object.freeze({ parameter: 'representationId', input: 'representation', field: 'representationId' }),
      Object.freeze({ parameter: 'viewId', input: 'representation', field: 'basisViewId' }),
    ]),
    exact: Object.freeze({
      deterministicTool: `${GARMENT_MESH_WARP_TOOL_ID}@${GARMENT_MESH_WARP_TOOL_VERSION}`,
      meshSchema: GARMENT_MESH_WARP_SCHEMA,
      sourceCoordinateSpace: 'PRIMARY_VIEW_NORMALIZED_Q16',
      destinationCoordinateSpace: 'PROJECT_IMAGE_NORMALIZED_Q16',
      fixedPointBits: GARMENT_MESH_WARP_FIXED_POINT_BITS,
      rasterization: 'DECLARED_TRIANGLE_ORDER_FIRST_OWNER',
      interpolation: 'BILINEAR_NORMALIZED_Q16_MESH',
      rounding: 'ROUND_HALF_UP',
      alphaPolicy: 'PREMULTIPLIED_ALPHA_WITH_STRAIGHT_RGB_WHEN_WEIGHTED_ALPHA_ZERO',
      uncoveredPixels: 'TRANSPARENT_BLACK',
      maxOutputPixels: GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS,
      maxRasterWork: GARMENT_MESH_WARP_MAX_RASTER_WORK,
    }),
    relationships: Object.freeze(['REPRESENTATION_BASIS_VIEW_EQUALS_PIXEL_SOURCE_VIEW']),
  }),
  browser: Object.freeze({
    executorId: 'garment-mesh-warp-rgba8-browser-v1',
    runtime: 'BROWSER_JS',
    accelerator: 'cpu',
  }),
  verification: Object.freeze({
    verifierId: 'garment-mesh-warp-rgba8-core-v1',
    comparison: 'BYTE_EXACT_CORE_RECOMPUTE',
  }),
  pixelContract: Object.freeze({
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'BILINEAR_PREMULTIPLIED_ALPHA_UNPREMULTIPLY',
    alpha: 'BILINEAR_ALPHA_ROUND_HALF_UP',
    interpolation: 'BILINEAR_NORMALIZED_Q16_MESH',
    rounding: 'ROUND_HALF_UP',
    transparentRgb: 'STRAIGHT_BILINEAR_WHEN_WEIGHTED_ALPHA_ZERO',
    uncoveredPixels: 'TRANSPARENT_BLACK',
    overlapOwnership: 'DECLARED_TRIANGLE_ORDER_FIRST_OWNER',
  }),
  resourcePolicy: Object.freeze({
    enforcement: 'CORE_CONFIG_AND_TICKET',
    dimensions: 'CORE_IMAGE_MAX_DIMENSION',
    pixels: 'CORE_IMAGE_MAX_PIXELS',
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES',
    hardOutputPixels: 'GARMENT_MESH_WARP_V1_MAX_OUTPUT_PIXELS',
    maxRasterWork: 'GARMENT_MESH_WARP_V1_MAX_RASTER_WORK',
  }),
  lineage: Object.freeze({
    parentInputs: Object.freeze(['projectSource']),
    managedParents: Object.freeze(['basisView', 'representation']),
    finalRole: 'WORKING',
    producerOperation: GARMENT_MESH_WARP_OPERATION,
  }),
});

export const GARMENT_MESH_WARP_TOOL_DEFINITION = GARMENT_MESH_WARP_TOOL_DEFINITION_DATA;
