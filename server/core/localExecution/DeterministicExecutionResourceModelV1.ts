import {
  ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
  RESIZE_TOOL_DEFINITION,
  type DeterministicToolDefinition,
} from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';

export const DETERMINISTIC_EXECUTION_RESOURCE_ESTIMATE_V1_SCHEMA = 'BERS_DETERMINISTIC_EXECUTION_RESOURCE_ESTIMATE_V1' as const;
export const DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION = 1 as const;

const MIB = 1024 * 1024;
const MIN_RUNTIME_RESERVE_BYTES = 16 * MIB;
const PNG_ENCODED_BOUND_FIXED_BYTES = 1024;

type Geometry = Readonly<{ width: number; height: number }>;

type ResourceProfile = Readonly<{
  profileId: string;
  profileVersion: typeof DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION;
  canonicalTool: DeterministicToolDefinition;
}>;

export type DeterministicExecutionResourceEstimateV1 = Readonly<{
  schemaVersion: typeof DETERMINISTIC_EXECUTION_RESOURCE_ESTIMATE_V1_SCHEMA;
  modelVersion: typeof DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION;
  profileId: string;
  profileVersion: typeof DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION;
  executor: Readonly<{
    kind: 'DETERMINISTIC_TOOL';
    toolId: string;
    version: string;
    browserExecutorId: string;
    runtime: 'BROWSER_JS';
    accelerator: 'cpu';
  }>;
  source: Geometry;
  output: Geometry;
  accountedBytes: Readonly<{
    sourceRgbaBytes: number;
    outputRgbaBytes: number;
    pngScanlineBytes: number;
    pngInputCopyBytes: number;
    encodedPayloadBoundBytes: number;
    runtimeReserveBytes: number;
  }>;
  browserPeakBytes: number;
  coreVerificationPeakBytes: number;
  requiredPeakMemoryBytes: number;
}>;

export class DeterministicExecutionResourceModelV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DeterministicExecutionResourceModelV1Error';
    this.code = code;
  }
}

const PROFILES: readonly ResourceProfile[] = Object.freeze([
  Object.freeze({
    profileId: 'orthogonal-transform-rgba8-browser-core-v1',
    profileVersion: DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION,
    canonicalTool: ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
  }),
  Object.freeze({
    profileId: 'resize-rgba8-browser-core-v1',
    profileVersion: DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION,
    canonicalTool: RESIZE_TOOL_DEFINITION,
  }),
]);

/**
 * Core-owned deterministic local-execution resource model for #548.
 *
 * V1 intentionally models only the two AE-4 deterministic browser tools. The
 * accounting follows their actual execution shape: canonical RGBA source,
 * output RGBA, deterministic PNG scanlines, the explicit CompressionStream
 * input copy, compressed/final encoded payloads, and Core byte-exact decode +
 * recomputation. A deterministic reserve covers runtime/native stream working
 * memory that is not represented by JavaScript TypedArrays.
 *
 * This is an admission model, not OS/process hard isolation. Runtime telemetry
 * may validate or force a versioned profile increase; it never widens an
 * admitted AEE memory envelope.
 */
export function estimateDeterministicExecutionResourcesV1(
  tool: DeterministicToolDefinition,
  sourceInput: Geometry,
  outputInput: Geometry,
): DeterministicExecutionResourceEstimateV1 {
  const profile = requireProfile(tool);
  const source = geometry(sourceInput, 'source');
  const output = geometry(outputInput, 'output');

  const sourceRgbaBytes = rgbaBytes(source, 'source');
  const outputRgbaBytes = rgbaBytes(output, 'output');
  const pngScanlineBytes = checkedAdd(outputRgbaBytes, output.height, 'PNG scanlines');
  const pngInputCopyBytes = pngScanlineBytes;

  // CompressionStream uses DEFLATE. V1 deliberately budgets a payload up to
  // 2x the deterministic scanline input plus fixed PNG/zlib framing margin,
  // which is substantially more conservative than normal DEFLATE expansion.
  const encodedPayloadBoundBytes = checkedAdd(
    checkedMul(pngScanlineBytes, 2, 'encoded payload bound'),
    PNG_ENCODED_BOUND_FIXED_BYTES,
    'encoded payload bound',
  );

  // Scale the non-TypedArray reserve with the canonical raster working set so
  // large images do not rely on a tiny fixed native/runtime allowance.
  const runtimeReserveBytes = Math.max(
    MIN_RUNTIME_RESERVE_BYTES,
    checkedAdd(sourceRgbaBytes, outputRgbaBytes, 'runtime reserve'),
  );

  // Browser worst accounted phase: source + output remain reachable while the
  // encoder holds scanlines, its explicit copy, compressed bytes and final PNG.
  const browserPeakBytes = checkedSum([
    sourceRgbaBytes,
    outputRgbaBytes,
    pngScanlineBytes,
    pngInputCopyBytes,
    encodedPayloadBoundBytes,
    encodedPayloadBoundBytes,
    runtimeReserveBytes,
  ], 'browser peak');

  // Core verification conservatively accounts the uploaded encoded payload,
  // canonical source, decoded candidate, independently recomputed expected
  // output, one persistence/encoding-sized output copy and runtime/native work.
  const coreVerificationPeakBytes = checkedSum([
    sourceRgbaBytes,
    outputRgbaBytes,
    outputRgbaBytes,
    outputRgbaBytes,
    encodedPayloadBoundBytes,
    runtimeReserveBytes,
  ], 'Core verification peak');

  return deepFreeze({
    schemaVersion: DETERMINISTIC_EXECUTION_RESOURCE_ESTIMATE_V1_SCHEMA,
    modelVersion: DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    executor: {
      kind: 'DETERMINISTIC_TOOL' as const,
      toolId: tool.executor.toolId,
      version: tool.executor.version,
      browserExecutorId: tool.browser.executorId,
      runtime: tool.browser.runtime,
      accelerator: tool.browser.accelerator,
    },
    source,
    output,
    accountedBytes: {
      sourceRgbaBytes,
      outputRgbaBytes,
      pngScanlineBytes,
      pngInputCopyBytes,
      encodedPayloadBoundBytes,
      runtimeReserveBytes,
    },
    browserPeakBytes,
    coreVerificationPeakBytes,
    requiredPeakMemoryBytes: Math.max(browserPeakBytes, coreVerificationPeakBytes),
  });
}

function requireProfile(tool: DeterministicToolDefinition): ResourceProfile {
  const profile = PROFILES.find(candidate => sameExecutor(candidate.canonicalTool, tool));
  if (!profile) {
    fail('deterministic_resource_profile_unavailable', `No V1 memory profile exists for ${tool.executor.toolId}@${tool.executor.version}`);
  }
  const canonical = profile.canonicalTool;
  if (tool.capability !== canonical.capability
    || tool.operation.id !== canonical.operation.id
    || tool.operation.type !== canonical.operation.type
    || tool.operation.version !== canonical.operation.version
    || tool.browser.executorId !== canonical.browser.executorId
    || tool.browser.runtime !== canonical.browser.runtime
    || tool.browser.accelerator !== canonical.browser.accelerator
    || tool.verification.comparison !== canonical.verification.comparison) {
    fail('deterministic_resource_profile_contract_mismatch', `${tool.executor.toolId}@${tool.executor.version} differs from its reviewed V1 resource profile`);
  }
  return profile;
}

function sameExecutor(left: DeterministicToolDefinition, right: DeterministicToolDefinition): boolean {
  return left.executor.kind === right.executor.kind
    && left.executor.toolId === right.executor.toolId
    && left.executor.version === right.executor.version;
}

function geometry(input: Geometry, label: string): Geometry {
  if (!Number.isSafeInteger(input?.width) || !Number.isSafeInteger(input?.height) || input.width < 1 || input.height < 1) {
    fail('deterministic_resource_geometry_invalid', `${label} geometry must use positive safe integers`);
  }
  checkedMul(input.width, input.height, `${label} pixels`);
  return Object.freeze({ width: input.width, height: input.height });
}

function rgbaBytes(value: Geometry, label: string): number {
  return checkedMul(checkedMul(value.width, value.height, `${label} pixels`), 4, `${label} RGBA bytes`);
}

function checkedSum(values: readonly number[], label: string): number {
  return values.reduce((sum, value) => checkedAdd(sum, value, label), 0);
}

function checkedAdd(left: number, right: number, label: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) fail('deterministic_resource_estimate_overflow', `${label} exceeds safe integer accounting`);
  return value;
}

function checkedMul(left: number, right: number, label: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value) || value < 0) fail('deterministic_resource_estimate_overflow', `${label} exceeds safe integer accounting`);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new DeterministicExecutionResourceModelV1Error(code, message);
}
