import { immutableClone } from '../immutable';
import type { ExecutionProvider, InferenceRequest, InferenceResult, LocalArtifact, LocalModelRuntime, ModelManifest, OnnxSession, OnnxSessionFactory, RuntimeEstimate, RuntimeHealth, RuntimeSnapshot, TensorValue } from '../types';

const PROVIDERS: readonly ExecutionProvider[] = ['webgpu', 'wasm', 'cuda', 'dml', 'coreml', 'cpu', 'nnapi'];

export class OnnxLocalRuntime implements LocalModelRuntime {
  #model?: ModelManifest; #session?: OnnxSession; #provider?: ExecutionProvider; #active = new Map<string, AbortController>(); #lastLatency?: number;
  constructor(private readonly sessions: OnnxSessionFactory, private readonly allowedProviders: readonly ExecutionProvider[], private readonly now: () => number = () => performance.now()) {
    if (!allowedProviders.length || allowedProviders.some((provider) => !PROVIDERS.includes(provider))) throw new Error('No allowed ONNX execution provider');
  }
  async load(model: ModelManifest, bytes: Uint8Array): Promise<void> {
    if (model.status !== 'READY') throw new Error('ModelTrustRegistry approval and READY status are required');
    if (model.modelFormat !== 'ONNX') throw new Error('ONNX runtime only loads ONNX models');
    if (!bytes.byteLength) throw new Error('Model artifact is empty');
    await this.unload(); this.#session = await this.sessions.create(bytes.slice(), { executionProviders: this.allowedProviders }); this.#model = immutableClone(model) as ModelManifest; this.#provider = this.allowedProviders[0];
  }
  async unload(): Promise<void> { for (const controller of this.#active.values()) controller.abort(); this.#active.clear(); await this.#session?.release?.(); this.#session = undefined; this.#model = undefined; this.#provider = undefined; }
  async infer(request: InferenceRequest): Promise<InferenceResult> {
    if (!this.#session || !this.#model || !this.#provider) throw new Error('Runtime is not loaded');
    if (this.#active.has(request.requestId)) throw new Error('Duplicate request id');
    const controller = new AbortController(); this.#active.set(request.requestId, controller); const start = this.now();
    try { const outputs = await this.#session.run(request.inputs, request.outputNames); if (controller.signal.aborted) throw new Error('Inference cancelled'); const latencyMs = Math.max(0, this.now() - start); this.#lastLatency = latencyMs; const memoryBytes = tensorBytes(outputs); return immutableClone({ requestId: request.requestId, modelId: this.#model.modelId, outputs, provider: this.#provider, latencyMs, memoryBytes, artifact: normalizeArtifact(request.requestId, outputs) }) as InferenceResult; }
    finally { this.#active.delete(request.requestId); }
  }
  cancel(requestId: string): void { this.#active.get(requestId)?.abort(); }
  health(): RuntimeHealth { return immutableClone(this.#session ? { status: 'READY', provider: this.#provider } : { status: 'UNLOADED' }); }
  estimate(): RuntimeEstimate { return immutableClone({ latencyMs: this.#lastLatency ?? this.#model?.estimatedLatency ?? 0, memoryBytes: this.#model ? (this.#model.requiredRam + this.#model.requiredVram) * 1024 * 1024 : 0, energy: this.#model ? 1 - this.#model.energyScore : 0 }); }
  snapshot(): RuntimeSnapshot { return immutableClone({ loaded: Boolean(this.#session), modelId: this.#model?.modelId, provider: this.#provider, activeRequests: this.#active.size, lastLatencyMs: this.#lastLatency }); }
  debug(): Readonly<Record<string, unknown>> { return immutableClone({ ...this.snapshot(), allowedProviders: this.allowedProviders }); }
}
function tensorBytes(outputs: Readonly<Record<string, TensorValue>>): number { return Object.values(outputs).reduce((sum, value) => sum + value.data.length * 4, 0); }
function normalizeArtifact(id: string, outputs: Readonly<Record<string, TensorValue>>): LocalArtifact { const first = Object.values(outputs)[0]; return immutableClone({ id, kind: 'TENSOR', mimeType: 'application/x-local-ai-tensor', width: first?.dims.at(-1), height: first?.dims.at(-2), data: outputs, metadata: { local: true, dimensions: first?.dims ?? [] } }) as LocalArtifact; }
