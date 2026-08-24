import { immutableClone } from '../immutable';
import type {
  DeviceCapabilitySnapshot,
  ExecutionProvider,
  HashPort,
  LocalModelBenchmark,
  ModelManifest,
  RuntimeKind,
} from '../types';

export const BENCHMARK_EVIDENCE_SCHEMA_VERSION = 1 as const;

const RUNTIME_KEYS = [
  'ONNX_RUNTIME', 'WEBGPU', 'WASM', 'NNAPI', 'DIRECTML', 'CUDA', 'METAL', 'VULKAN',
] as const satisfies readonly RuntimeKind[];

export type BenchmarkEvidence = Readonly<{
  schemaVersion: 1;
  evidenceKey: string;
  deviceCapabilityKey: string;
  modelId: string;
  modelVersion: string;
  manifestSha256: string;
  runtime: RuntimeKind;
  provider: ExecutionProvider;
  capturedAt: number;
  expiresAt: number;
  sampleCount: number;
  coldStartMs: number;
  warmStartMs: number;
  latencyMs: number;
  ramBytes: number;
  vramBytes: number;
  energyEstimate: number;
  successRate: number;
  outputDimensions: readonly number[];
}>;

/**
 * Separate telemetry persistence. This port owns no install, provider, Billing, Project or Artifact authority.
 * Implementations must only resolve a write after their durable transaction commits.
 */
export interface BenchmarkEvidencePort {
  list(): Promise<readonly BenchmarkEvidence[]>;
  put(evidence: BenchmarkEvidence): Promise<void>;
  remove(evidenceKey: string): Promise<void>;
}

export type BenchmarkEvidenceBinding = Readonly<{
  deviceCapabilityKey: string;
  modelId: string;
  modelVersion: string;
  manifestSha256: string;
  runtime: RuntimeKind;
}>;

export class BenchmarkEvidenceStore {
  readonly #ttlMs: number;

  constructor(
    private readonly port: BenchmarkEvidencePort,
    private readonly hash: HashPort,
    private readonly clock: () => number = Date.now,
    ttlMs = 7 * 24 * 60 * 60 * 1000,
  ) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Benchmark evidence TTL must be finite and positive');
    this.#ttlMs = ttlMs;
  }

  async deviceCapabilityKey(snapshot: DeviceCapabilitySnapshot): Promise<string> {
    const profile = snapshot.profile;
    const canonical = JSON.stringify([
      snapshot.schemaVersion,
      profile.platform,
      profile.deviceClass,
      profile.tier,
      profile.ramMb,
      profile.vramMb,
      RUNTIME_KEYS.map((runtime) => [runtime, snapshot.runtimeCapabilities[runtime]]),
    ]);
    return this.hash.sha256(new TextEncoder().encode(canonical));
  }

  async binding(snapshot: DeviceCapabilitySnapshot, manifest: ModelManifest): Promise<BenchmarkEvidenceBinding> {
    return immutableClone({
      deviceCapabilityKey: await this.deviceCapabilityKey(snapshot),
      modelId: manifest.modelId,
      modelVersion: manifest.version,
      manifestSha256: manifest.sha256,
      runtime: manifest.runtime,
    });
  }

  async record(
    snapshot: DeviceCapabilitySnapshot,
    manifest: ModelManifest,
    benchmark: LocalModelBenchmark,
  ): Promise<BenchmarkEvidence> {
    if (benchmark.modelId !== manifest.modelId) throw new Error('Benchmark model identity does not match manifest');
    validateBenchmark(benchmark);
    const capturedAt = this.clock();
    if (!Number.isFinite(capturedAt) || capturedAt < 0) throw new Error('Benchmark capture timestamp must be finite and non-negative');
    const binding = await this.binding(snapshot, manifest);
    const evidenceKey = evidenceKeyFor(binding, benchmark.provider);
    const evidence: BenchmarkEvidence = immutableClone({
      schemaVersion: BENCHMARK_EVIDENCE_SCHEMA_VERSION,
      evidenceKey,
      ...binding,
      provider: benchmark.provider,
      capturedAt,
      expiresAt: capturedAt + this.#ttlMs,
      sampleCount: benchmark.sampleCount ?? 0,
      coldStartMs: benchmark.coldStartMs,
      warmStartMs: benchmark.warmStartMs,
      latencyMs: benchmark.latencyMs,
      ramBytes: benchmark.ramBytes,
      vramBytes: benchmark.vramBytes,
      energyEstimate: benchmark.energyEstimate,
      successRate: benchmark.successRate,
      outputDimensions: benchmark.outputDimensions,
    });
    await this.port.put(evidence);
    return evidence;
  }

  async forBinding(snapshot: DeviceCapabilitySnapshot, manifest: ModelManifest): Promise<readonly BenchmarkEvidence[]> {
    const binding = await this.binding(snapshot, manifest);
    const values = (await this.port.list())
      .filter((evidence) => evidence.schemaVersion === BENCHMARK_EVIDENCE_SCHEMA_VERSION)
      .filter((evidence) => exactBinding(evidence, binding))
      .sort((a, b) => b.capturedAt - a.capturedAt || a.provider.localeCompare(b.provider));
    return immutableClone(values);
  }

  async removeForModel(modelId: string): Promise<void> {
    const matches = (await this.port.list()).filter((evidence) => evidence.modelId === modelId);
    for (const evidence of matches) await this.port.remove(evidence.evidenceKey);
  }
}

export function evidenceKeyFor(binding: BenchmarkEvidenceBinding, provider: ExecutionProvider): string {
  return [
    `device=${binding.deviceCapabilityKey}`,
    `model=${binding.modelId}@${binding.modelVersion}`,
    `sha256=${binding.manifestSha256}`,
    `runtime=${binding.runtime}`,
    `provider=${provider}`,
  ].join('|');
}

export function exactBinding(evidence: BenchmarkEvidence, binding: BenchmarkEvidenceBinding): boolean {
  return evidence.deviceCapabilityKey === binding.deviceCapabilityKey
    && evidence.modelId === binding.modelId
    && evidence.modelVersion === binding.modelVersion
    && evidence.manifestSha256 === binding.manifestSha256
    && evidence.runtime === binding.runtime;
}

function validateBenchmark(benchmark: LocalModelBenchmark): void {
  const nonNegative = [
    benchmark.coldStartMs,
    benchmark.warmStartMs,
    benchmark.latencyMs,
    benchmark.ramBytes,
    benchmark.vramBytes,
    benchmark.energyEstimate,
  ];
  if (nonNegative.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Benchmark measurements must be finite and non-negative');
  if (!Number.isFinite(benchmark.successRate) || benchmark.successRate < 0 || benchmark.successRate > 1) {
    throw new Error('Benchmark success rate must be between 0 and 1');
  }
  if (benchmark.sampleCount !== undefined && (!Number.isInteger(benchmark.sampleCount) || benchmark.sampleCount < 0)) {
    throw new Error('Benchmark sample count must be a non-negative integer');
  }
  if (benchmark.outputDimensions.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error('Benchmark output dimensions must be non-negative integers');
  }
}
