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

export type DeterministicToolInputContract = Readonly<{
  name: string;
  kind: string;
  roles: readonly CreativeArtifactRole[];
  sha256: 'REQUIRED';
  geometry: 'SOURCE' | 'MATCH_SOURCE';
}>;

export type DeterministicToolOutputContract = Readonly<{
  kind: string;
  role: CreativeArtifactRole;
  count: 1;
  mimeTypes: readonly string[];
  geometry: 'MATCH_SOURCE' | 'CROP_RECT' | 'TARGET_DIMENSIONS';
}>;

export type DeterministicToolIntegerBound = Readonly<{
  parameter: string;
  min: number;
  maxReference: 'SOURCE_WIDTH_MINUS_1' | 'SOURCE_HEIGHT_MINUS_1' | 'SOURCE_WIDTH' | 'SOURCE_HEIGHT' | 'RESIZE_MAX_DIMENSION';
}>;

export type DeterministicToolParameterContract = Readonly<{
  artifactIdBindings: readonly Readonly<{ parameter: string; input: string }>[];
  exact: Readonly<Record<string, string | number | boolean>>;
  integerBounds?: readonly DeterministicToolIntegerBound[];
  relationships?: readonly ('X_PLUS_WIDTH_LE_SOURCE_WIDTH' | 'Y_PLUS_HEIGHT_LE_SOURCE_HEIGHT' | 'TARGET_PIXELS_LE_RESIZE_MAX_OUTPUT_PIXELS')[];
}>;

export type DeterministicToolDefinition = Readonly<{
  capability: string;
  operation: Readonly<{ id: string; type: string; version: string }>;
  executor: LocalExecutionToolExecutorBinding;
  inputs: readonly DeterministicToolInputContract[];
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
    rgb: 'PRESERVE_SOURCE_BYTES' | 'COPY_SOURCE_SUBRECT_BYTES' | 'BILINEAR_PREMULTIPLIED_ALPHA_UNPREMULTIPLY';
    alpha: 'SOURCE_ALPHA_X_MASK_ALPHA_ROUND_HALF_UP_DIV_255' | 'COPY_SOURCE_ALPHA_BYTES' | 'BILINEAR_ALPHA_ROUND_HALF_UP';
    interpolation?: 'NONE' | 'BILINEAR_FIXED_16_16_PIXEL_CENTER';
    rounding?: 'INTEGER_EXACT' | 'ROUND_HALF_UP';
    border?: 'REJECT_OUT_OF_BOUNDS' | 'CLAMP_TO_EDGE';
    transparentRgb?: 'STRAIGHT_BILINEAR_WHEN_WEIGHTED_ALPHA_ZERO';
  }>;
  resourcePolicy: Readonly<{
    enforcement: 'CORE_CONFIG_AND_TICKET';
    dimensions: 'CORE_IMAGE_MAX_DIMENSION';
    pixels: 'CORE_IMAGE_MAX_PIXELS';
    uploadBytes: 'CORE_IMAGE_UPLOAD_LIMIT_BYTES';
    hardOutputPixels?: 'RESIZE_V1_MAX_OUTPUT_PIXELS';
  }>;
  lineage: Readonly<{
    parentInputs: readonly string[];
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

/**
 * Data-only deterministic tool catalog. It describes already-reviewed tool contracts;
 * it is not capability admission and contains no executable callback or fallback.
 * Production admission remains an explicit server policy.
 */
export const DETERMINISTIC_TOOL_REGISTRY: readonly DeterministicToolDefinition[] = Object.freeze([
  backgroundIsolationDefinition,
  cropDefinition,
  resizeDefinition,
]);

export const BACKGROUND_ISOLATION_TOOL_DEFINITION = backgroundIsolationDefinition;
export const CROP_TOOL_DEFINITION = cropDefinition;
export const RESIZE_TOOL_DEFINITION = resizeDefinition;

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
