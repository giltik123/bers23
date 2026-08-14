import { LocalInferenceCache } from './cache/LocalInferenceCache';
import { LocalAICostModel } from './cost/LocalAICostModel';
import { LocalAIDebugger } from './debug/LocalAIDebugger';
import { DeviceAnalyzer } from './device/DeviceAnalyzer';
import { LocalRuntimeDetector } from './device/LocalRuntimeDetector';
import { immutableClone } from './immutable';
import { LocalModelDownloader } from './models/LocalModelDownloader';
import { LocalModelRegistry } from './models/LocalModelRegistry';
import { ExecutionTargetSelector } from './selection/ExecutionTargetSelector';
import { ModelSuitabilityScorer } from './selection/ModelSuitabilityScorer';
import { ResourceGovernor } from './selection/ResourceGovernor';
import { LocalAISandbox } from './security/LocalAISandbox';
import { ModelManifestVerifier, ModelSignatureVerifier, ModelTrustRegistry, type TrustPolicy } from './trust/ModelTrust';
import type { LocalAIDependencies, LocalAISnapshot, ModelManifest, PrivacyMode, TargetDecision, TargetRequest, TrustResult } from './types';

const DEFAULT_TRUST_POLICY: TrustPolicy = {
  publishers: [], formats: ['ONNX', 'TFLITE', 'SAFETENSORS', 'GGUF'],
  runtimes: ['ONNX_RUNTIME', 'WEBGPU', 'WASM', 'NNAPI', 'DIRECTML', 'CUDA', 'METAL', 'VULKAN'],
  licenses: ['Apache-2.0', 'MIT', 'BSD-3-Clause'],
};

export class LocalAIPlatform {
  readonly #registry = new LocalModelRegistry();
  readonly #verifier: ModelManifestVerifier;
  readonly #downloader: LocalModelDownloader;
  readonly #failures = new Map<string, number>();
  readonly cache: LocalInferenceCache;
  readonly sandbox = new LocalAISandbox();
  #lastSnapshot?: LocalAISnapshot;

  constructor(private readonly dependencies: LocalAIDependencies, policy: TrustPolicy = DEFAULT_TRUST_POLICY) {
    const trust = new ModelTrustRegistry(policy);
    this.#verifier = new ModelManifestVerifier(trust, new ModelSignatureVerifier(dependencies.signatureVerifier), dependencies.hash);
    this.#downloader = new LocalModelDownloader(dependencies.fetch, dependencies.storage, this.#registry, this.#verifier);
    this.cache = new LocalInferenceCache(dependencies.clock);
  }

  analyzeDevice() { return new DeviceAnalyzer(this.dependencies.deviceProvider).analyze(); }
  availableModels(): readonly ModelManifest[] { return this.#registry.list(); }
  async recommendModel(operation: TargetRequest['operation']): Promise<ModelManifest | undefined> {
    const device = await this.analyzeDevice(); const runtimes = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect(); const scorer = new ModelSuitabilityScorer();
    return this.#registry.list('READY').map((model) => ({ model, result: scorer.score(model, operation.requiredCapabilities, device, runtimes) })).filter((item) => item.result.eligible).sort((a, b) => b.result.score - a.result.score || a.model.modelId.localeCompare(b.model.modelId))[0]?.model;
  }
  async installModel(manifest: ModelManifest): Promise<ModelManifest> {
    const trust = await this.verifyModel(manifest); if (!trust.trusted) { this.#registry.get(manifest.modelId) ? this.#registry.updateStatus(manifest.modelId, 'QUARANTINED') : this.#registry.register({ ...manifest, status: 'QUARANTINED' }); throw new Error(trust.errors.join('; ')); }
    const device = await this.analyzeDevice(); const runtimes = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect();
    if (!manifest.supportedPlatforms.includes(device.platform) || runtimes[manifest.runtime] !== true || !new ResourceGovernor().evaluate(device, manifest).allowed) throw new Error('Model is incompatible with device resources or runtime');
    return this.#downloader.download(manifest);
  }
  async removeModel(modelId: string): Promise<void> { await this.#downloader.remove(modelId); }
  verifyModel(manifest: ModelManifest, bytes?: Uint8Array): Promise<TrustResult> { return this.#verifier.verify(manifest, bytes); }
  async selectExecutionTarget(request: Omit<TargetRequest, 'device' | 'models'>): Promise<TargetDecision> {
    const device = await this.analyzeDevice(); const runtimeCapabilities = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect();
    const decision = new ExecutionTargetSelector(runtimeCapabilities).select({ ...request, device, models: this.#registry.list('READY') });
    const trustStatus = decision.model ? await this.verifyModel(decision.model) : null;
    const safeDecision = trustStatus && !trustStatus.trusted ? { ...decision, target: 'BLOCKED' as const, model: undefined, reason: 'Selected model failed trust validation', fallback: null } : decision;
    this.#lastSnapshot = immutableClone({ deviceProfile: device, runtimeCapabilities, installedModels: this.#registry.list(), selectedModel: safeDecision.model, executionTarget: safeDecision.target, resourceDecision: safeDecision.resource, privacyPolicy: request.privacyMode, trustStatus, fallback: safeDecision.fallback, timeline: [{ sequence: 1, event: `operation:${request.operation.operationId}` }, { sequence: 2, event: `target:${safeDecision.target}` }] });
    return immutableClone(safeDecision);
  }
  estimate(modelId: string | undefined, cloudCredits: number, privacyValue: number) { return new LocalAICostModel().estimate(modelId ? this.#registry.get(modelId) : undefined, cloudCredits, privacyValue); }
  inspect(modelId: string): ModelManifest | undefined { return this.#registry.get(modelId); }
  snapshot(): LocalAISnapshot | undefined { return this.#lastSnapshot; }
  debug() { return this.#lastSnapshot ? new LocalAIDebugger().inspect(this.#lastSnapshot) : undefined; }
  explain(): string | undefined { return this.#lastSnapshot ? new LocalAIDebugger().explain(this.#lastSnapshot) : undefined; }
  replay(snapshot: LocalAISnapshot): LocalAISnapshot { return immutableClone(snapshot) as LocalAISnapshot; }
  pauseDownload(modelId: string): void { this.#downloader.pause(modelId); }
  resumeDownload(manifest: ModelManifest): Promise<ModelManifest> { return this.#downloader.resume(manifest); }
  cancelDownload(modelId: string): void { this.#downloader.cancel(modelId); }
  rollbackModel(modelId: string): ModelManifest { return this.#downloader.rollback(modelId); }
  reportRuntimeFailure(modelId: string): ModelManifest {
    const count = (this.#failures.get(modelId) ?? 0) + 1; this.#failures.set(modelId, count);
    return count >= 3 ? this.#registry.updateStatus(modelId, 'QUARANTINED') : this.#registry.updateStatus(modelId, 'FAILED');
  }
  restoreQuarantined(modelId: string, explicitlyAllowed: boolean): ModelManifest { if (!explicitlyAllowed) throw new Error('Explicit recovery policy is required'); this.#failures.delete(modelId); return this.#registry.updateStatus(modelId, 'READY'); }
}
