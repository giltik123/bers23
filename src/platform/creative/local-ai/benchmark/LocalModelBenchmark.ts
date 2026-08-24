import { immutableClone } from '../immutable';
import type { InferenceRequest, InferenceResult, LocalModelBenchmark as Benchmark, LocalModelRuntime, ModelManifest } from '../types';

const BENCHMARK_SAMPLES = 3;

export class LocalModelBenchmarker {
  constructor(private readonly now: () => number = () => performance.now()) {}

  async run(runtime: LocalModelRuntime, model: ModelManifest, bytes: Uint8Array, request: InferenceRequest): Promise<Benchmark> {
    const cold = this.now();
    await runtime.load(model, bytes);
    const coldStartMs = Math.max(0, this.now() - cold);
    let success = 0;
    const latencies: number[] = [];
    let result: InferenceResult | undefined;
    for (let index = 0; index < BENCHMARK_SAMPLES; index += 1) {
      const start = this.now();
      try {
        result = await runtime.infer({ ...request, requestId: `${request.requestId}:${index}` });
        success += 1;
      } catch {
        // Failure is represented by successRate; elapsed time still belongs in latency evidence.
      } finally {
        latencies.push(Math.max(0, this.now() - start));
      }
    }
    if (!result) throw new Error('Model warm-up failed');
    const estimate = runtime.estimate();
    const dims = Object.values(result.outputs)[0]?.dims ?? [];
    return immutableClone({
      modelId: model.modelId,
      sampleCount: BENCHMARK_SAMPLES,
      coldStartMs,
      warmStartMs: latencies[0],
      latencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      ramBytes: estimate.memoryBytes,
      vramBytes: model.requiredVram * 1024 * 1024,
      energyEstimate: estimate.energy,
      successRate: success / BENCHMARK_SAMPLES,
      outputDimensions: dims,
      provider: result.provider,
    });
  }
}
