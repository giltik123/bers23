import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalModelBenchmarker } from '../src/platform/creative/local-ai/benchmark/LocalModelBenchmark.ts';
import type {
  InferenceRequest,
  InferenceResult,
  LocalModelRuntime,
  ModelManifest,
  RuntimeEstimate,
  RuntimeHealth,
  RuntimeSnapshot,
} from '../src/platform/creative/local-ai/types.ts';

const model: ModelManifest = {
  modelId: 'benchmark-failure-latency',
  version: '1.0.0',
  family: 'test',
  capabilities: ['SEGMENTATION'],
  modelFormat: 'ONNX',
  runtime: 'WASM',
  sizeBytes: 4,
  requiredRam: 1,
  requiredVram: 0,
  supportedPlatforms: ['BROWSER'],
  supportedAccelerators: ['WASM'],
  estimatedLatency: 100,
  qualityScore: .9,
  energyScore: .8,
  privacyLevel: 'PRIVATE',
  license: 'MIT',
  publisher: 'trusted',
  downloadUri: 'https://models.example/benchmark-failure-latency.onnx',
  sha256: 'a'.repeat(64),
  signature: 'valid',
  status: 'READY',
  stabilityScore: .99,
};

class Runtime implements LocalModelRuntime {
  constructor(private readonly advance: (milliseconds: number) => void) {}

  async load(): Promise<void> { this.advance(5); }
  async unload(): Promise<void> {}
  async infer(request: InferenceRequest): Promise<InferenceResult> {
    const sample = Number(request.requestId.split(':').at(-1));
    const elapsed = sample === 1 ? 30 : 10;
    this.advance(elapsed);
    if (sample === 1) throw new Error('intentional benchmark sample failure');
    return {
      requestId: request.requestId,
      modelId: model.modelId,
      outputs: { mask: { data: new Float32Array([1, 1, 1, 1]), dims: [1, 2, 2] } },
      provider: 'wasm',
      latencyMs: elapsed,
      memoryBytes: 4,
      artifact: { id: request.requestId, kind: 'TENSOR', mimeType: 'application/x-local-ai-tensor', data: {}, metadata: { local: true } },
    };
  }
  cancel(): void {}
  health(): RuntimeHealth { return { status: 'READY', provider: 'wasm' }; }
  estimate(): RuntimeEstimate { return { latencyMs: 10, memoryBytes: 1024, energy: .2 }; }
  snapshot(): RuntimeSnapshot { return { loaded: true, modelId: model.modelId, provider: 'wasm', activeRequests: 0 }; }
  debug(): Readonly<Record<string, unknown>> { return {}; }
}

test('failed benchmark sample contributes its elapsed latency while remaining samples continue', async () => {
  let clock = 0;
  const runtime = new Runtime((milliseconds) => { clock += milliseconds; });
  const benchmark = await new LocalModelBenchmarker(() => clock).run(
    runtime,
    model,
    new Uint8Array([1, 2, 3, 4]),
    { requestId: 'bench', inputs: {} },
  );

  assert.equal(benchmark.sampleCount, 3);
  assert.equal(benchmark.coldStartMs, 5);
  assert.equal(benchmark.warmStartMs, 10);
  assert.equal(benchmark.successRate, 2 / 3);
  assert.equal(benchmark.provider, 'wasm');
  assert.ok(Math.abs(benchmark.latencyMs - (50 / 3)) < 1e-9, 'failed 30ms sample must not be recorded as zero');
});
