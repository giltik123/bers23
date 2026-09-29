import type { CreativeArtifactRole } from '../canonical/contracts.ts';
import type { LocalExecutionToolExecutorBinding } from '../canonical/localExecution.ts';
import {
  BACKGROUND_ISOLATION_CAPABILITY,
  BACKGROUND_ISOLATION_TOOL_ID,
  BACKGROUND_ISOLATION_TOOL_VERSION,
} from './BackgroundIsolationIdentity.js';
import {
  CROP_CAPABILITY,
  CROP_OPERATION,
  CROP_STEP_ID,
  CROP_TOOL_ID,
  CROP_TOOL_VERSION,
} from './CropIdentity.js';
import {
  RESIZE_CAPABILITY,
  RESIZE_FIXED_POINT_BITS,
  RESIZE_MAX_DIMENSION,
  RESIZE_MAX_OUTPUT_PIXELS,
  RESIZE_OPERATION,
  RESIZE_STEP_ID,
  RESIZE_TOOL_ID,
  RESIZE_TOOL_VERSION,
} from './ResizeIdentity.js';
import {
  ORTHOGONAL_TRANSFORM_CAPABILITY,
  ORTHOGONAL_TRANSFORM_MODES,
  ORTHOGONAL_TRANSFORM_OPERATION,
  ORTHOGONAL_TRANSFORM_STEP_ID,
  ORTHOGONAL_TRANSFORM_TOOL_ID,
  ORTHOGONAL_TRANSFORM_TOOL_VERSION,
} from './OrthogonalTransformIdentity.js';
import {
  AFFINE_FIXED_POINT_BITS,
  AFFINE_MAX_LINEAR_COEFFICIENT_ABS,
  AFFINE_MAX_OUTPUT_PIXELS,
  AFFINE_MAX_TRANSLATION_ABS,
  AFFINE_TRANSFORM_CAPABILITY,
  AFFINE_TRANSFORM_OPERATION,
  AFFINE_TRANSFORM_STEP_ID,
  AFFINE_TRANSFORM_TOOL_ID,
  AFFINE_TRANSFORM_TOOL_VERSION,
} from './AffineTransformIdentity.js';
import {
  EXPOSURE_CAPABILITY,
  EXPOSURE_GAIN_FIXED_POINT_BITS,
  EXPOSURE_MAX_EIGHTH_STOPS,
  EXPOSURE_MIN_EIGHTH_STOPS,
  EXPOSURE_OPERATION,
  EXPOSURE_STEP_ID,
  EXPOSURE_STOP_DENOMINATOR,
  EXPOSURE_TOOL_ID,
  EXPOSURE_TOOL_VERSION,
} from './ExposureIdentity.js';
import {
  WHITE_BALANCE_CAPABILITY,
  WHITE_BALANCE_GAIN_FIXED_POINT_BITS,
  WHITE_BALANCE_MAX_TEMPERATURE_Q8,
  WHITE_BALANCE_MAX_TINT_Q8,
  WHITE_BALANCE_MIN_TEMPERATURE_Q8,
  WHITE_BALANCE_MIN_TINT_Q8,
  WHITE_BALANCE_OPERATION,
  WHITE_BALANCE_PARAMETER_FRACTION_BITS,
  WHITE_BALANCE_STEP_ID,
  WHITE_BALANCE_TOOL_ID,
  WHITE_BALANCE_TOOL_VERSION,
} from './WhiteBalanceIdentity.js';
import {
  MASKED_WHITE_BALANCE_CAPABILITY,
  MASKED_WHITE_BALANCE_MAX_TEMPERATURE_Q8,
  MASKED_WHITE_BALANCE_MAX_TINT_Q8,
  MASKED_WHITE_BALANCE_PARAMETER_FRACTION_BITS,
  MASKED_WHITE_BALANCE_GAIN_FIXED_POINT_BITS,
  MASKED_WHITE_BALANCE_MIN_TEMPERATURE_Q8,
  MASKED_WHITE_BALANCE_MIN_TINT_Q8,
  MASKED_WHITE_BALANCE_OPERATION,
  MASKED_WHITE_BALANCE_STEP_ID,
  MASKED_WHITE_BALANCE_TOOL_ID,
  MASKED_WHITE_BALANCE_TOOL_VERSION,
} from './MaskedWhiteBalanceIdentity.js';
import {
  MASKED_EXPOSURE_CAPABILITY,
  MASKED_EXPOSURE_MAX_EIGHTH_STOPS,
  MASKED_EXPOSURE_MIN_EIGHTH_STOPS,
  MASKED_EXPOSURE_OPERATION,
  MASKED_EXPOSURE_STEP_ID,
  MASKED_EXPOSURE_TOOL_ID,
  MASKED_EXPOSURE_TOOL_VERSION,
} from './MaskedExposureIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION_DATA } from './GarmentMeshWarpRegistryDefinition.js';
import { GARMENT_TEXTURE_COMPOSITE_TOOL_DEFINITION_DATA } from './GarmentTextureCompositeRegistryDefinition.js';

export type DeterministicToolInputContract = Readonly<{
  name: string;
  kind: string;
  roles: readonly CreativeArtifactRole[];
  sha256: 'REQUIRED';
  geometry: 'SOURCE' | 'MATCH_SOURCE';
}>;

/**
 * Non-Project deterministic input authority. These bindings are intentionally
 * separate from `inputs`: a managed Garment view/representation can never be
 * laundered into the Project Artifact namespace merely because a tool consumes it.
 */
export type DeterministicToolManagedInputContract = Readonly<{
  name: string;
  authority: 'MANAGED_GARMENT';
  kind: 'GARMENT_VIEW' | 'GARMENT_REPRESENTATION';
  sha256: 'REQUIRED';
  use: 'PIXEL_SOURCE' | 'GEOMETRY_AUTHORITY';
  contentType: 'image/png' | 'application/vnd.bers.garment-parametric+json';
  encoding?: 'PNG_RGBA8_LOSSLESS';
  tier?: 'PARAMETRIC';
  format?: 'BERS_PARAMETRIC_V1';
}>;

export type DeterministicToolOutputContract = Readonly<{
  kind: string;
  role: CreativeArtifactRole;
  count: 1;
  mimeTypes: readonly string[];
  geometry: 'MATCH_SOURCE' | 'CROP_RECT' | 'TARGET_DIMENSIONS' | 'ORTHOGONAL_MODE' | 'PROJECT_SOURCE_DIMENSIONS';
}>;

export type DeterministicToolIntegerBound = Readonly<{
  parameter: string;
  min: number;
  maxReference: 'SOURCE_WIDTH_MINUS_1' | 'SOURCE_HEIGHT_MINUS_1' | 'SOURCE_WIDTH' | 'SOURCE_HEIGHT' | 'RESIZE_MAX_DIMENSION';
}>;

export type DeterministicToolParameterContract = Readonly<{
  artifactIdBindings: readonly Readonly<{ parameter: string; input: string }>[];
  managedIdBindings?: readonly Readonly<{ parameter: string; input: string; field: 'garmentId' | 'viewId' | 'representationId' | 'basisViewId' }>[];
  exact: Readonly<Record<string, string | number | boolean>>;
  integerBounds?: readonly DeterministicToolIntegerBound[];
  integerRanges?: readonly Readonly<{ parameter: string; min: number; max: number }>[];
  enumValues?: readonly Readonly<{ parameter: string; values: readonly string[] }>[];
  relationships?: readonly ('X_PLUS_WIDTH_LE_SOURCE_WIDTH' | 'Y_PLUS_HEIGHT_LE_SOURCE_HEIGHT' | 'TARGET_PIXELS_LE_RESIZE_MAX_OUTPUT_PIXELS' | 'REPRESENTATION_BASIS_VIEW_EQUALS_PIXEL_SOURCE_VIEW')[];
}>;

export type DeterministicToolDefinition = Readonly<{
  capability: string;
  operation: Readonly<{ id: string; type: string; version: string }>;
  executor: LocalExecutionToolExecutorBinding;
  inputs: readonly DeterministicToolInputContract[];
  managedInputs?: readonly DeterministicToolManagedInputContract[];
  output: DeterministicToolOutputContract;
  parameters: DeterministicToolParameterContract;
  browser: Readonly<{
    executorId: string;
    runtime: 'BROWSER_JS';
    accelerator: 'cpu';
  }>;
  verification: Readonly<{
    verifierId: string;
    comparison: 'BYTE_EXACT_CORE_RECOMPUTE';
  }>;
  pixelContract: Readonly<{
    format: 'RGBA8';
    colorSpace: 'srgb';
    orientation: 1;
    rgb: 'PRESERVE_SOURCE_BYTES' | 'COPY_SOURCE_SUBRECT_BYTES' | 'BILINEAR_PREMULTIPLIED_ALPHA_UNPREMULTIPLY' | 'COPY_SOURCE_RGBA_TUPLE_PERMUTATION' | 'SRGB_ENCODED_EXPOSURE_GAIN_Q16' | 'SRGB_ENCODED_EXPOSURE_GAIN_Q16_MASK_ALPHA8_BLEND' | 'SRGB_ENCODED_WHITE_BALANCE_Q8_TO_Q16' | 'SRGB_ENCODED_WHITE_BALANCE_Q8_TO_Q16_MASK_ALPHA8_BLEND' | 'TEXTURE_MAP_WARP_FEATHER_SOURCE_OVER';
    alpha: 'SOURCE_ALPHA_X_MASK_ALPHA_ROUND_HALF_UP_DIV_255' | 'COPY_SOURCE_ALPHA_BYTES' | 'BILINEAR_ALPHA_ROUND_HALF_UP' | 'TEXTURE_PRESERVE_WARP_FEATHER_SOURCE_OVER';
    interpolation?: 'NONE' | 'BILINEAR_FIXED_16_16_PIXEL_CENTER' | 'BILINEAR_FIXED_16_16_AFFINE_PIXEL_CENTER' | 'BILINEAR_NORMALIZED_Q16_MESH' | 'BILINEAR_NORMALIZED_Q16_TEXTURE_AND_MESH';
    rounding?: 'INTEGER_EXACT' | 'ROUND_HALF_UP';
    border?: 'REJECT_OUT_OF_BOUNDS' | 'CLAMP_TO_EDGE' | 'TRANSPARENT_BLACK';
    transparentRgb?: 'STRAIGHT_BILINEAR_WHEN_WEIGHTED_ALPHA_ZERO' | 'ZERO_WHEN_WEIGHTED_ALPHA_ZERO' | 'PRESERVE_BASE_RGB_ON_TRANSPARENT_TEXTURE_SAMPLE_AND_ZERO_FINAL_WHEN_ALPHA_ZERO';
    uncoveredPixels?: 'TRANSPARENT_BLACK';
    overlapOwnership?: 'DECLARED_TRIANGLE_ORDER_FIRST_OWNER';
  }>;
  resourcePolicy: Readonly<{
    enforcement: 'CORE_CONFIG_AND_TICKET';
    dimensions: 'CORE_IMAGE_MAX_DIMENSION';
    pixels: 'CORE_IMAGE_MAX_PIXELS';
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES';
    hardOutputPixels?: 'RESIZE_V1_MAX_OUTPUT_PIXELS' | 'AFFINE_V1_MAX_OUTPUT_PIXELS' | 'GARMENT_MESH_WARP_V1_MAX_OUTPUT_PIXELS' | 'GARMENT_TEXTURE_COMPOSITE_V1_MAX_OUTPUT_PIXELS';
    maxRasterWork?: 'GARMENT_MESH_WARP_V1_MAX_RASTER_WORK';
  }>;
  lineage: Readonly<{
    parentInputs: readonly string[];
    managedParents?: readonly string[];
    finalRole: CreativeArtifactRole;
    producerOperation: string;
  }>;
}>;

const backgroundIsolationDefinition: DeterministicToolDefinition = deepFreeze({
  capability: BACKGROUND_ISOLATION_CAPABILITY,
  operation: { id: 'background-isolation', type: 'BACKGROUND_ISOLATION', version: '1' },
  executor: { kind: 'DETERMINISTIC_TOOL', toolId: BACKGROUND_ISOLATION_TOOL_ID, version: BACKGROUND_ISOLATION_TOOL_VERSION },
  inputs: [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
    { name: 'mask', kind: 'mask', roles: ['MASK'], sha256: 'REQUIRED', geometry: 'MATCH_SOURCE' },
  ],
  output: { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'MATCH_SOURCE' },
  parameters: {
    artifactIdBindings: [
      { parameter: 'sourceArtifactId', input: 'source' },
      { parameter: 'maskArtifactId', input: 'mask' },
    ],
    exact: { deterministicTool: `${BACKGROUND_ISOLATION_TOOL_ID}@${BACKGROUND_ISOLATION_TOOL_VERSION}` },
  },
  browser: { executorId: 'background-isolation-rgba8-browser-v1', runtime: 'BROWSER_JS', accelerator: 'cpu' },
  verification: { verifierId: 'background-isolation-rgba8-core-v1', comparison: 'BYTE_EXACT_CORE_RECOMPUTE' },
  pixelContract: {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'PRESERVE_SOURCE_BYTES',
    alpha: 'SOURCE_ALPHA_X_MASK_ALPHA_ROUND_HALF_UP_DIV_255',
  },
  resourcePolicy: {
    enforcement: 'CORE_CONFIG_AND_TICKET',
    dimensions: 'CORE_IMAGE_MAX_DIMENSION',
    pixels: 'CORE_IMAGE_MAX_PIXELS',
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES',
  },
  lineage: { parentInputs: ['source', 'mask'], finalRole: 'COMPOSITE', producerOperation: 'BACKGROUND_ISOLATION' },
});

const maskedWhiteBalanceDefinition: DeterministicToolDefinition = deepFreeze({
  capability: MASKED_WHITE_BALANCE_CAPABILITY,
  operation: { id: MASKED_WHITE_BALANCE_STEP_ID, type: MASKED_WHITE_BALANCE_OPERATION, version: '1' },
  executor: { kind: 'DETERMINISTIC_TOOL', toolId: MASKED_WHITE_BALANCE_TOOL_ID, version: MASKED_WHITE_BALANCE_TOOL_VERSION },
  inputs: [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
    { name: 'mask', kind: 'mask', roles: ['MASK'], sha256: 'REQUIRED', geometry: 'MATCH_SOURCE' },
  ],
  output: { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'MATCH_SOURCE' },
  parameters: {
    artifactIdBindings: [
      { parameter: 'sourceArtifactId', input: 'source' },
      { parameter: 'maskArtifactId', input: 'mask' },
    ],
    exact: {
      deterministicTool: `${MASKED_WHITE_BALANCE_TOOL_ID}@${MASKED_WHITE_BALANCE_TOOL_VERSION}`,
      coordinateSpace: 'CANONICAL_ORIENTATION_1_RGBA8_PLUS_ALPHA8_MASK',
      transferDomain: 'SRGB_ENCODED_BYTE_DOMAIN',
      parameterEncoding: 'SIGNED_Q8_RELATIVE_CHANNEL_BALANCE',
      parameterFractionBits: MASKED_WHITE_BALANCE_PARAMETER_FRACTION_BITS,
      gainEncoding: 'Q16_16_DERIVED_INTEGER',
      gainFixedPointBits: MASKED_WHITE_BALANCE_GAIN_FIXED_POINT_BITS,
      temperatureLaw: 'RED_PLUS_BLUE_MINUS_EQUAL_Q8',
      tintLaw: 'MAGENTA_PLUS_HALF_GREEN_MINUS_FULL_Q8',
      gainRounding: 'ROUND_HALF_UP',
      maskBlend: 'SOURCE_ADJUSTED_ALPHA8_ROUND_HALF_UP',
      alphaPolicy: 'COPY_SOURCE_ALPHA_BYTES',
    },
    integerRanges: [
      { parameter: 'temperatureQ8', min: MASKED_WHITE_BALANCE_MIN_TEMPERATURE_Q8, max: MASKED_WHITE_BALANCE_MAX_TEMPERATURE_Q8 },
      { parameter: 'tintQ8', min: MASKED_WHITE_BALANCE_MIN_TINT_Q8, max: MASKED_WHITE_BALANCE_MAX_TINT_Q8 },
    ],
  },
  browser: { executorId: 'masked-white-balance-rgba8-browser-v1', runtime: 'BROWSER_JS', accelerator: 'cpu' },
  verification: { verifierId: 'masked-white-balance-rgba8-core-v1', comparison: 'BYTE_EXACT_CORE_RECOMPUTE' },
  pixelContract: {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'SRGB_ENCODED_WHITE_BALANCE_Q8_TO_Q16_MASK_ALPHA8_BLEND',
    alpha: 'COPY_SOURCE_ALPHA_BYTES',
    interpolation: 'NONE',
    rounding: 'ROUND_HALF_UP',
  },
  resourcePolicy: {
    enforcement: 'CORE_CONFIG_AND_TICKET',
    dimensions: 'CORE_IMAGE_MAX_DIMENSION',
    pixels: 'CORE_IMAGE_MAX_PIXELS',
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES',
  },
  lineage: { parentInputs: ['source', 'mask'], finalRole: 'COMPOSITE', producerOperation: MASKED_WHITE_BALANCE_OPERATION },
});

const maskedExposureDefinition: DeterministicToolDefinition = deepFreeze({
  capability: MASKED_EXPOSURE_CAPABILITY,
  operation: { id: MASKED_EXPOSURE_STEP_ID, type: MASKED_EXPOSURE_OPERATION, version: '1' },
  executor: { kind: 'DETERMINISTIC_TOOL', toolId: MASKED_EXPOSURE_TOOL_ID, version: MASKED_EXPOSURE_TOOL_VERSION },
  inputs: [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
    { name: 'mask', kind: 'mask', roles: ['MASK'], sha256: 'REQUIRED', geometry: 'MATCH_SOURCE' },
  ],
  output: { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'MATCH_SOURCE' },
  parameters: {
    artifactIdBindings: [
      { parameter: 'sourceArtifactId', input: 'source' },
      { parameter: 'maskArtifactId', input: 'mask' },
    ],
    exact: {
      deterministicTool: `${MASKED_EXPOSURE_TOOL_ID}@${MASKED_EXPOSURE_TOOL_VERSION}`,
      coordinateSpace: 'CANONICAL_ORIENTATION_1_RGBA8_PLUS_ALPHA8_MASK',
      transferDomain: 'SRGB_ENCODED_BYTE_DOMAIN',
      gainEncoding: 'Q16_16_COMMITTED_EIGHTH_STOP_TABLE',
      stopDenominator: 8,
      gainRounding: 'ROUND_HALF_UP',
      maskBlend: 'SOURCE_ADJUSTED_ALPHA8_ROUND_HALF_UP',
      alphaPolicy: 'COPY_SOURCE_ALPHA_BYTES',
    },
    integerRanges: [
      { parameter: 'eighthStops', min: MASKED_EXPOSURE_MIN_EIGHTH_STOPS, max: MASKED_EXPOSURE_MAX_EIGHTH_STOPS },
    ],
  },
  browser: { executorId: 'masked-exposure-rgba8-browser-v1', runtime: 'BROWSER_JS', accelerator: 'cpu' },
  verification: { verifierId: 'masked-exposure-rgba8-core-v1', comparison: 'BYTE_EXACT_CORE_RECOMPUTE' },
  pixelContract: {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'SRGB_ENCODED_EXPOSURE_GAIN_Q16_MASK_ALPHA8_BLEND',
    alpha: 'COPY_SOURCE_ALPHA_BYTES',
    interpolation: 'NONE',
    rounding: 'ROUND_HALF_UP',
  },
  resourcePolicy: {
    enforcement: 'CORE_CONFIG_AND_TICKET',
    dimensions: 'CORE_IMAGE_MAX_DIMENSION',
    pixels: 'CORE_IMAGE_MAX_PIXELS',
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES',
  },
  lineage: { parentInputs: ['source', 'mask'], finalRole: 'COMPOSITE', producerOperation: MASKED_EXPOSURE_OPERATION },
});

const cropDefinition: DeterministicToolDefinition = deepFreeze({
  capability: CROP_CAPABILITY,
  operation: { id: CROP_STEP_ID, type: CROP_OPERATION, version: '1' },
  executor: { kind: 'DETERMINISTIC_TOOL', toolId: CROP_TOOL_ID, version: CROP_TOOL_VERSION },
  inputs: [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
  ],
  output: { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'CROP_RECT' },
  parameters: {
    artifactIdBindings: [{ parameter: 'sourceArtifactId', input: 'source' }],
    exact: {
      deterministicTool: `${CROP_TOOL_ID}@${CROP_TOOL_VERSION}`,
      coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_INDICES',
      rectangleSemantics: 'HALF_OPEN',
    },
    integerBounds: [
      { parameter: 'x', min: 0, maxReference: 'SOURCE_WIDTH_MINUS_1' },
      { parameter: 'y', min: 0, maxReference: 'SOURCE_HEIGHT_MINUS_1' },
      { parameter: 'width', min: 1, maxReference: 'SOURCE_WIDTH' },
      { parameter: 'height', min: 1, maxReference: 'SOURCE_HEIGHT' },
    ],
    relationships: ['X_PLUS_WIDTH_LE_SOURCE_WIDTH', 'Y_PLUS_HEIGHT_LE_SOURCE_HEIGHT'],
  },
  browser: { executorId: 'crop-rgba8-browser-v1', runtime: 'BROWSER_JS', accelerator: 'cpu' },
  verification: { verifierId: 'crop-rgba8-core-v1', comparison: 'BYTE_EXACT_CORE_RECOMPUTE' },
  pixelContract: {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'COPY_SOURCE_SUBRECT_BYTES',
    alpha: 'COPY_SOURCE_ALPHA_BYTES',
    interpolation: 'NONE',
    rounding: 'INTEGER_EXACT',
    border: 'REJECT_OUT_OF_BOUNDS',
  },
  resourcePolicy: {
    enforcement: 'CORE_CONFIG_AND_TICKET',
    dimensions: 'CORE_IMAGE_MAX_DIMENSION',
    pixels: 'CORE_IMAGE_MAX_PIXELS',
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES',
  },
  lineage: { parentInputs: ['source'], finalRole: 'COMPOSITE', producerOperation: CROP_OPERATION },
});

const resizeDefinition: DeterministicToolDefinition = deepFreeze({
  capability: RESIZE_CAPABILITY,
  operation: { id: RESIZE_STEP_ID, type: RESIZE_OPERATION, version: '1' },
  executor: { kind: 'DETERMINISTIC_TOOL', toolId: RESIZE_TOOL_ID, version: RESIZE_TOOL_VERSION },
  inputs: [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
  ],
  output: { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'TARGET_DIMENSIONS' },
  parameters: {
    artifactIdBindings: [{ parameter: 'sourceArtifactId', input: 'source' }],
    exact: {
      deterministicTool: `${RESIZE_TOOL_ID}@${RESIZE_TOOL_VERSION}`,
      coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_CENTERS',
      interpolation: 'BILINEAR_FIXED_16_16_PIXEL_CENTER',
      fixedPointBits: RESIZE_FIXED_POINT_BITS,
      rounding: 'ROUND_HALF_UP',
      borderPolicy: 'CLAMP_TO_EDGE',
      alphaPolicy: 'PREMULTIPLIED_ALPHA_WITH_STRAIGHT_RGB_WHEN_WEIGHTED_ALPHA_ZERO',
      maxOutputPixels: RESIZE_MAX_OUTPUT_PIXELS,
    },
    integerBounds: [
      { parameter: 'width', min: 1, maxReference: 'RESIZE_MAX_DIMENSION' },
      { parameter: 'height', min: 1, maxReference: 'RESIZE_MAX_DIMENSION' },
    ],
    relationships: ['TARGET_PIXELS_LE_RESIZE_MAX_OUTPUT_PIXELS'],
  },
  browser: { executorId: 'resize-rgba8-browser-v1', runtime: 'BROWSER_JS', accelerator: 'cpu' },
  verification: { verifierId: 'resize-rgba8-core-v1', comparison: 'BYTE_EXACT_CORE_RECOMPUTE' },
  pixelContract: {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'BILINEAR_PREMULTIPLIED_ALPHA_UNPREMULTIPLY',
    alpha: 'BILINEAR_ALPHA_ROUND_HALF_UP',
    interpolation: 'BILINEAR_FIXED_16_16_PIXEL_CENTER',
    rounding: 'ROUND_HALF_UP',
    border: 'CLAMP_TO_EDGE',
    transparentRgb: 'STRAIGHT_BILINEAR_WHEN_WEIGHTED_ALPHA_ZERO',
  },
  resourcePolicy: {
    enforcement: 'CORE_CONFIG_AND_TICKET',
    dimensions: 'CORE_IMAGE_MAX_DIMENSION',
    pixels: 'CORE_IMAGE_MAX_PIXELS',
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES',
    hardOutputPixels: 'RESIZE_V1_MAX_OUTPUT_PIXELS',
  },
  lineage: { parentInputs: ['source'], finalRole: 'COMPOSITE', producerOperation: RESIZE_OPERATION },
});

const exposureDefinition: DeterministicToolDefinition = deepFreeze({
  capability: EXPOSURE_CAPABILITY,
  operation: { id: EXPOSURE_STEP_ID, type: EXPOSURE_OPERATION, version: '1' },
  executor: { kind: 'DETERMINISTIC_TOOL', toolId: EXPOSURE_TOOL_ID, version: EXPOSURE_TOOL_VERSION },
  inputs: [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
  ],
  output: { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'MATCH_SOURCE' },
  parameters: {
    artifactIdBindings: [{ parameter: 'sourceArtifactId', input: 'source' }],
    exact: {
      deterministicTool: `${EXPOSURE_TOOL_ID}@${EXPOSURE_TOOL_VERSION}`,
      coordinateSpace: 'CANONICAL_ORIENTATION_1_RGBA8',
      transferDomain: 'SRGB_ENCODED_BYTE_DOMAIN',
      gainEncoding: 'Q16_16_COMMITTED_EIGHTH_STOP_TABLE',
      stopDenominator: EXPOSURE_STOP_DENOMINATOR,
      fixedPointBits: EXPOSURE_GAIN_FIXED_POINT_BITS,
      rounding: 'ROUND_HALF_UP',
      alphaPolicy: 'COPY_SOURCE_ALPHA_BYTES',
      outputGeometry: 'MATCH_SOURCE',
    },
    integerRanges: [
      { parameter: 'eighthStops', min: EXPOSURE_MIN_EIGHTH_STOPS, max: EXPOSURE_MAX_EIGHTH_STOPS },
    ],
  },
  browser: { executorId: 'exposure-rgba8-browser-v1', runtime: 'BROWSER_JS', accelerator: 'cpu' },
  verification: { verifierId: 'exposure-rgba8-core-v1', comparison: 'BYTE_EXACT_CORE_RECOMPUTE' },
  pixelContract: {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'SRGB_ENCODED_EXPOSURE_GAIN_Q16',
    alpha: 'COPY_SOURCE_ALPHA_BYTES',
    interpolation: 'NONE',
    rounding: 'ROUND_HALF_UP',
  },
  resourcePolicy: {
    enforcement: 'CORE_CONFIG_AND_TICKET',
    dimensions: 'CORE_IMAGE_MAX_DIMENSION',
    pixels: 'CORE_IMAGE_MAX_PIXELS',
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES',
  },
  lineage: { parentInputs: ['source'], finalRole: 'COMPOSITE', producerOperation: EXPOSURE_OPERATION },
});

const whiteBalanceDefinition: DeterministicToolDefinition = deepFreeze({
  capability: WHITE_BALANCE_CAPABILITY,
  operation: { id: WHITE_BALANCE_STEP_ID, type: WHITE_BALANCE_OPERATION, version: '1' },
  executor: { kind: 'DETERMINISTIC_TOOL', toolId: WHITE_BALANCE_TOOL_ID, version: WHITE_BALANCE_TOOL_VERSION },
  inputs: [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
  ],
  output: { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'MATCH_SOURCE' },
  parameters: {
    artifactIdBindings: [{ parameter: 'sourceArtifactId', input: 'source' }],
    exact: {
      deterministicTool: `${WHITE_BALANCE_TOOL_ID}@${WHITE_BALANCE_TOOL_VERSION}`,
      coordinateSpace: 'CANONICAL_ORIENTATION_1_RGBA8',
      transferDomain: 'SRGB_ENCODED_BYTE_DOMAIN',
      parameterEncoding: 'SIGNED_Q8_RELATIVE_CHANNEL_BALANCE',
      parameterFractionBits: WHITE_BALANCE_PARAMETER_FRACTION_BITS,
      gainEncoding: 'Q16_16_DERIVED_INTEGER',
      gainFixedPointBits: WHITE_BALANCE_GAIN_FIXED_POINT_BITS,
      temperatureLaw: 'RED_PLUS_BLUE_MINUS_EQUAL_Q8',
      tintLaw: 'MAGENTA_PLUS_HALF_GREEN_MINUS_FULL_Q8',
      rounding: 'ROUND_HALF_UP',
      alphaPolicy: 'COPY_SOURCE_ALPHA_BYTES',
      outputGeometry: 'MATCH_SOURCE',
    },
    integerRanges: [
      { parameter: 'temperatureQ8', min: WHITE_BALANCE_MIN_TEMPERATURE_Q8, max: WHITE_BALANCE_MAX_TEMPERATURE_Q8 },
      { parameter: 'tintQ8', min: WHITE_BALANCE_MIN_TINT_Q8, max: WHITE_BALANCE_MAX_TINT_Q8 },
    ],
  },
  browser: { executorId: 'white-balance-rgba8-browser-v1', runtime: 'BROWSER_JS', accelerator: 'cpu' },
  verification: { verifierId: 'white-balance-rgba8-core-v1', comparison: 'BYTE_EXACT_CORE_RECOMPUTE' },
  pixelContract: {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'SRGB_ENCODED_WHITE_BALANCE_Q8_TO_Q16',
    alpha: 'COPY_SOURCE_ALPHA_BYTES',
    interpolation: 'NONE',
    rounding: 'ROUND_HALF_UP',
  },
  resourcePolicy: {
    enforcement: 'CORE_CONFIG_AND_TICKET',
    dimensions: 'CORE_IMAGE_MAX_DIMENSION',
    pixels: 'CORE_IMAGE_MAX_PIXELS',
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES',
  },
  lineage: { parentInputs: ['source'], finalRole: 'COMPOSITE', producerOperation: WHITE_BALANCE_OPERATION },
});

const affineTransformDefinition: DeterministicToolDefinition = deepFreeze({
  capability: AFFINE_TRANSFORM_CAPABILITY,
  operation: { id: AFFINE_TRANSFORM_STEP_ID, type: AFFINE_TRANSFORM_OPERATION, version: '1' },
  executor: { kind: 'DETERMINISTIC_TOOL', toolId: AFFINE_TRANSFORM_TOOL_ID, version: AFFINE_TRANSFORM_TOOL_VERSION },
  inputs: [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
  ],
  output: { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'MATCH_SOURCE' },
  parameters: {
    artifactIdBindings: [{ parameter: 'sourceArtifactId', input: 'source' }],
    exact: {
      deterministicTool: `${AFFINE_TRANSFORM_TOOL_ID}@${AFFINE_TRANSFORM_TOOL_VERSION}`,
      coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_CENTERS',
      matrix: 'INVERSE_AFFINE_Q16_16',
      fixedPointBits: AFFINE_FIXED_POINT_BITS,
      interpolation: 'BILINEAR_FIXED_16_16_AFFINE_PIXEL_CENTER',
      rounding: 'ROUND_HALF_UP',
      borderPolicy: 'TRANSPARENT_BLACK',
      alphaPolicy: 'PREMULTIPLIED_ALPHA_ZERO_RGB_WHEN_WEIGHTED_ALPHA_ZERO',
      outputGeometry: 'MATCH_SOURCE',
      maxOutputPixels: AFFINE_MAX_OUTPUT_PIXELS,
    },
    integerRanges: [
      { parameter: 'm00Q16', min: -AFFINE_MAX_LINEAR_COEFFICIENT_ABS, max: AFFINE_MAX_LINEAR_COEFFICIENT_ABS },
      { parameter: 'm01Q16', min: -AFFINE_MAX_LINEAR_COEFFICIENT_ABS, max: AFFINE_MAX_LINEAR_COEFFICIENT_ABS },
      { parameter: 'm10Q16', min: -AFFINE_MAX_LINEAR_COEFFICIENT_ABS, max: AFFINE_MAX_LINEAR_COEFFICIENT_ABS },
      { parameter: 'm11Q16', min: -AFFINE_MAX_LINEAR_COEFFICIENT_ABS, max: AFFINE_MAX_LINEAR_COEFFICIENT_ABS },
      { parameter: 'txQ16', min: -AFFINE_MAX_TRANSLATION_ABS, max: AFFINE_MAX_TRANSLATION_ABS },
      { parameter: 'tyQ16', min: -AFFINE_MAX_TRANSLATION_ABS, max: AFFINE_MAX_TRANSLATION_ABS },
    ],
  },
  browser: { executorId: 'affine-transform-rgba8-browser-v1', runtime: 'BROWSER_JS', accelerator: 'cpu' },
  verification: { verifierId: 'affine-transform-rgba8-core-v1', comparison: 'BYTE_EXACT_CORE_RECOMPUTE' },
  pixelContract: {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'BILINEAR_PREMULTIPLIED_ALPHA_UNPREMULTIPLY',
    alpha: 'BILINEAR_ALPHA_ROUND_HALF_UP',
    interpolation: 'BILINEAR_FIXED_16_16_AFFINE_PIXEL_CENTER',
    rounding: 'ROUND_HALF_UP',
    border: 'TRANSPARENT_BLACK',
    transparentRgb: 'ZERO_WHEN_WEIGHTED_ALPHA_ZERO',
  },
  resourcePolicy: {
    enforcement: 'CORE_CONFIG_AND_TICKET',
    dimensions: 'CORE_IMAGE_MAX_DIMENSION',
    pixels: 'CORE_IMAGE_MAX_PIXELS',
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES',
    hardOutputPixels: 'AFFINE_V1_MAX_OUTPUT_PIXELS',
  },
  lineage: { parentInputs: ['source'], finalRole: 'COMPOSITE', producerOperation: AFFINE_TRANSFORM_OPERATION },
});

const orthogonalTransformDefinition: DeterministicToolDefinition = deepFreeze({
  capability: ORTHOGONAL_TRANSFORM_CAPABILITY,
  operation: { id: ORTHOGONAL_TRANSFORM_STEP_ID, type: ORTHOGONAL_TRANSFORM_OPERATION, version: '1' },
  executor: { kind: 'DETERMINISTIC_TOOL', toolId: ORTHOGONAL_TRANSFORM_TOOL_ID, version: ORTHOGONAL_TRANSFORM_TOOL_VERSION },
  inputs: [
    { name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' },
  ],
  output: { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'ORTHOGONAL_MODE' },
  parameters: {
    artifactIdBindings: [{ parameter: 'sourceArtifactId', input: 'source' }],
    exact: {
      deterministicTool: `${ORTHOGONAL_TRANSFORM_TOOL_ID}@${ORTHOGONAL_TRANSFORM_TOOL_VERSION}`,
      coordinateSpace: 'CANONICAL_ORIENTATION_1_INTEGER_PIXEL_INDICES',
      mapping: 'ORTHOGONAL_INVERSE_INDEX_PERMUTATION',
      interpolation: 'NONE',
      rounding: 'INTEGER_EXACT',
      alphaPolicy: 'COPY_RGBA_TUPLE_EXACTLY',
    },
    enumValues: [{ parameter: 'mode', values: ORTHOGONAL_TRANSFORM_MODES }],
  },
  browser: { executorId: 'orthogonal-transform-rgba8-browser-v1', runtime: 'BROWSER_JS', accelerator: 'cpu' },
  verification: { verifierId: 'orthogonal-transform-rgba8-core-v1', comparison: 'BYTE_EXACT_CORE_RECOMPUTE' },
  pixelContract: {
    format: 'RGBA8',
    colorSpace: 'srgb',
    orientation: 1,
    rgb: 'COPY_SOURCE_RGBA_TUPLE_PERMUTATION',
    alpha: 'COPY_SOURCE_ALPHA_BYTES',
    interpolation: 'NONE',
    rounding: 'INTEGER_EXACT',
  },
  resourcePolicy: {
    enforcement: 'CORE_CONFIG_AND_TICKET',
    dimensions: 'CORE_IMAGE_MAX_DIMENSION',
    pixels: 'CORE_IMAGE_MAX_PIXELS',
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES',
  },
  lineage: { parentInputs: ['source'], finalRole: 'COMPOSITE', producerOperation: ORTHOGONAL_TRANSFORM_OPERATION },
});

const garmentMeshWarpDefinition: DeterministicToolDefinition = GARMENT_MESH_WARP_TOOL_DEFINITION_DATA;
const garmentTextureCompositeDefinition: DeterministicToolDefinition = deepFreeze(GARMENT_TEXTURE_COMPOSITE_TOOL_DEFINITION_DATA);

/**
 * Data-only deterministic tool catalog. It describes reviewed tool contracts;
 * it is not capability admission and contains no executable callback or fallback.
 * Production admission remains an explicit server policy.
 */
export const DETERMINISTIC_TOOL_REGISTRY: readonly DeterministicToolDefinition[] = Object.freeze([
  backgroundIsolationDefinition,
  cropDefinition,
  resizeDefinition,
  exposureDefinition,
  whiteBalanceDefinition,
  maskedWhiteBalanceDefinition,
  maskedExposureDefinition,
  affineTransformDefinition,
  orthogonalTransformDefinition,
  garmentMeshWarpDefinition,
  garmentTextureCompositeDefinition,
]);

export const BACKGROUND_ISOLATION_TOOL_DEFINITION = backgroundIsolationDefinition;
export const CROP_TOOL_DEFINITION = cropDefinition;
export const RESIZE_TOOL_DEFINITION = resizeDefinition;
export const EXPOSURE_TOOL_DEFINITION = exposureDefinition;
export const WHITE_BALANCE_TOOL_DEFINITION = whiteBalanceDefinition;
export const MASKED_WHITE_BALANCE_TOOL_DEFINITION = maskedWhiteBalanceDefinition;
export const MASKED_EXPOSURE_TOOL_DEFINITION = maskedExposureDefinition;
export const AFFINE_TRANSFORM_TOOL_DEFINITION = affineTransformDefinition;
export const ORTHOGONAL_TRANSFORM_TOOL_DEFINITION = orthogonalTransformDefinition;
export const GARMENT_MESH_WARP_TOOL_DEFINITION = garmentMeshWarpDefinition;
export const GARMENT_TEXTURE_COMPOSITE_TOOL_DEFINITION = garmentTextureCompositeDefinition;

export function findDeterministicToolByCapability(capability: string): DeterministicToolDefinition | undefined {
  return DETERMINISTIC_TOOL_REGISTRY.find(definition => definition.capability === capability);
}

export function requireDeterministicToolByCapability(capability: string): DeterministicToolDefinition {
  const definition = findDeterministicToolByCapability(capability);
  if (!definition) throw new Error(`Deterministic tool capability is not registered: ${capability}`);
  return definition;
}

export function findDeterministicToolByExecutor(executor: Readonly<{ kind: string; toolId?: string; version?: string }>): DeterministicToolDefinition | undefined {
  if (executor.kind !== 'DETERMINISTIC_TOOL' || !executor.toolId || !executor.version) return undefined;
  return DETERMINISTIC_TOOL_REGISTRY.find(definition => definition.executor.toolId === executor.toolId && definition.executor.version === executor.version);
}

export function requireDeterministicToolByExecutor(executor: Readonly<{ kind: string; toolId?: string; version?: string }>): DeterministicToolDefinition {
  const definition = findDeterministicToolByExecutor(executor);
  if (!definition) throw new Error(`Deterministic tool executor is not registered: ${executor.toolId ?? 'unknown'}@${executor.version ?? 'unknown'}`);
  return definition;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
