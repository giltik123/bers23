import { createHash } from 'node:crypto';
import type { DeterministicToolDefinition } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';

export const DETERMINISTIC_EXECUTION_RESOURCE_ESTIMATE_V1_SCHEMA = 'BERS_DETERMINISTIC_EXECUTION_RESOURCE_ESTIMATE_V1' as const;
export const DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION = 1 as const;

const MIB = 1024 * 1024;
const MIN_RUNTIME_RESERVE_BYTES = 16 * MIB;
const PNG_ENCODED_BOUND_FIXED_BYTES = 1024;

type Geometry = Readonly<{ width: number; height: number }>;

type ResourceProfile = Readonly<{
  profileId: string;
  profileVersion: typeof DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION;
  executor: Readonly<{ toolId: string; version: string }>;
  /** SHA-256 of recursively key-sorted JSON for the complete reviewed tool definition. */
  contractSha256: string;
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

/**
 * These digests are intentionally independent pins, not hashes recomputed from
 * imported registry constants. A semantic registry change at the same executor
 * version must fail closed until this resource profile is explicitly reviewed
 * and repinned/versioned.
 */
const PROFILES: readonly ResourceProfile[] = Object.freeze([
  Object.freeze({
    profileId: 'orthogonal-transform-rgba8-browser-core-v1',
    profileVersion: DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION,
    executor: Object.freeze({ toolId: 'orthogonal-transform', version: '1' }),
    contractSha256: 'faeea1fca52360370ff8557c4459c3fabd16aed02bfa70ce28ea0fe79f293790',
  }),
  Object.freeze({
    profileId: 'resize-rgba8-browser-core-v1',
    profileVersion: DETERMINISTIC_EXECUTION_RESOURCE_MODEL_V1_VERSION,
    executor: Object.freeze({ toolId: 'resize', version: '1' }),
    contractSha256: '8c0aa17cfcf55cd1e6fc19fc0737560fba2d5df69716d9af1fc069ad5bf1f0c2',
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
  // encoder holds scanlines, its explicit copy, compressed/IDAT/final bytes.
  // Two 2x encoded bounds conservatively cover the three roughly scanline-sized
  // encoded representations without pretending to know zlib allocator details.
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
  const profile = PROFILES.find(candidate =>
    tool.executor.kind === 'DETERMINISTIC_TOOL'
    && candidate.executor.toolId === tool.executor.toolId
    && candidate.executor.version === tool.executor.version);
  if (!profile) {
    fail('deterministic_resource_profile_unavailable', `No V1 memory profile exists for ${tool.executor.toolId}@${tool.executor.version}`);
  }
  const actualFingerprint = toolContractSha256(tool);
  if (actualFingerprint !== profile.contractSha256) {
    fail(
      'deterministic_resource_profile_contract_mismatch',
      `${tool.executor.toolId}@${tool.executor.version} contract ${actualFingerprint} differs from reviewed V1 resource profile ${profile.contractSha256}`,
    );
  }
  return profile;
}

function toolContractSha256(tool: DeterministicToolDefinition): string {
  return createHash('sha256').update(canonicalJson(tool), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('deterministic_resource_profile_contract_invalid', 'Deterministic tool contract contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left === right ? 0 : left < right ? -1 : 1);
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
  }
  fail('deterministic_resource_profile_contract_invalid', `Deterministic tool contract contains unsupported ${typeof value}`);
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
