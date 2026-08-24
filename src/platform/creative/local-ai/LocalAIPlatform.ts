import { LocalInferenceCache } from './cache/LocalInferenceCache';
import { LocalAICostModel } from './cost/LocalAICostModel';
import { LocalAIDebugger } from './debug/LocalAIDebugger';
import { DeviceAnalyzer } from './device/DeviceAnalyzer';
import { DeviceCapabilitySnapshotBuilder } from './device/DeviceCapabilitySnapshot';
import { LocalRuntimeDetector } from './device/LocalRuntimeDetector';
import { immutableClone } from './immutable';
import { LocalModelDownloader } from './models/LocalModelDownloader';
import { LocalModelRegistry } from './models/LocalModelRegistry';
import { LocalModelBenchmarker } from './benchmark/LocalModelBenchmark';
import { OnnxLocalRuntime } from './runtimes/OnnxLocalRuntime';
import { DesktopLocalRuntime, MobileLocalRuntime, WebLocalRuntime } from './runtimes/PlatformRuntimes';
import { LocalResultVerifier, compareLocalCloud as compare } from './verification/LocalResultVerifier';
import { ExecutionTargetSelector } from './selection/ExecutionTargetSelector';
import { ModelFleetPlanner, modelFleetKey } from './selection/ModelFleetPlanner';
import { ModelSuitabilityScorer } from './selection/ModelSuitabilityScorer';
import { ResourceGovernor } from './selection/ResourceGovernor';
import { LocalAISandbox } from './security/LocalAISandbox';
import { ModelManifestVerifier, ModelSignatureVerifier, ModelTrustRegistry, type TrustPolicy } from './trust/ModelTrust';
import type { DeviceCapabilitySnapshot, InferenceRequest, InferenceResult, LocalAIDependencies, LocalAISnapshot, LocalModelBenchmark, LocalModelRuntime, ModelBundle, ModelFleetRecommendation, ModelFleetRecommendationPolicy, ModelManifest, ResultVerification, TargetDecision, TargetRequest, TrustResult } from './types';

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
  readonly #runtimes = new Map<string, LocalModelRuntime>();
  readonly #benchmarks = new Map<string, LocalModelBenchmark>();
  #lastSnapshot?: LocalAISnapshot;

  constructor(private readonly dependencies: LocalAIDependencies, policy: TrustPolicy = DEFAULT_TRUST_POLICY) {
    const trust = new ModelTrustRegistry(policy);
    this.#verifier = new ModelManifestVerifier(trust, new ModelSignatureVerifier(dependencies.signatureVerifier), dependencies.hash);
    this.#downloader = new LocalModelDownloader(dependencies.fetch, dependencies.storage, this.#registry, this.#verifier);
    this.cache = new LocalInferenceCache(dependencies.clock);
  }

  analyzeDevice() { return new DeviceAnalyzer(this.dependencies.deviceProvider).analyze(); }

  async capabilitySnapshot(): Promise<DeviceCapabilitySnapshot> {
    const device = await this.analyzeDevice();
    const runtimes = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect();
    return new DeviceCapabilitySnapshotBuilder().build(device, runtimes, this.dependencies.clock());
  }

  availableModels(): readonly ModelManifest[] { return this.#registry.list(); }

  async recommendModel(operation: TargetRequest['operation']): Promise<ModelManifest | undefined> {
    const device = await this.analyzeDevice(); const runtimes = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect(); const scorer = new ModelSuitabilityScorer();
    return this.#registry.list('READY').map((model) => ({ model, result: scorer.score(model, operation.requiredCapabilities, device, runtimes) })).filter((item) => item.result.eligible).sort((a, b) => b.result.score - a.result.score || a.model.modelId.localeCompare(b.model.modelId))[0]?.model;
  }

  async recommendFleet(policy?: ModelFleetRecommendationPolicy): Promise<ModelFleetRecommendation> {
    return this.#recommendFleet(await this.capabilitySnapshot(), policy);
  }

  async installModel(manifest: ModelManifest): Promise<ModelManifest> {
    const trust = await this.verifyModel(manifest); if (!trust.trusted) { this.#registry.get(manifest.modelId) ? this.#registry.updateStatus(manifest.modelId, 'QUARANTINED') : this.#registry.register({ ...manifest, status: 'QUARANTINED' }); throw new Error(trust.errors.join('; ')); }
    const device = await this.analyzeDevice(); const runtimes = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect();
    if (!manifest.supportedPlatforms.includes(device.platform) || runtimes[manifest.runtime] !== true || !new ResourceGovernor().evaluate(device, manifest).allowed) throw new Error('Model is incompatible with device resources or runtime');
    return this.#downloader.download(manifest);
  }

  async removeModel(modelId: string): Promise<void> { await this.#downloader.remove(modelId); }

  async recommendedBundle(): Promise<ModelBundle> {
    const snapshot = await this.capabilitySnapshot();
    const fleet = await this.#recommendFleet(snapshot);
    return immutableClone({ id: legacyBundleId(snapshot), modelIds: fleet.modelIds, estimatedBytes: fleet.estimatedBytes, reasoning: 'NO' as const, generation: 'NO' as const });
  }

  async installRecommendedBundle(): Promise<readonly ModelManifest[]> {
    const recommendation = await this.recommendFleet();
    if (recommendation.status !== 'READY') return Object.freeze([]);
    const catalog = this.dependencies.modelCatalog ?? []; const installed: ModelManifest[] = [];
    for (const modelId of recommendation.modelIds) { const manifest = catalog.find((item) => item.modelId === modelId); if (manifest) installed.push(await this.installModel(manifest)); }
    return immutableClone(installed);
  }

  async loadModel(modelId: string): Promise<void> {
    const model = this.#registry.get(modelId); if (!model || model.status !== 'READY') throw new Error('Only trusted READY models can be loaded');
    const bytes = await this.dependencies.storage.read(modelId); if (!bytes) throw new Error('Installed model artifact is missing'); const trust = await this.verifyModel(model, bytes); if (!trust.trusted) { this.#registry.updateStatus(modelId, 'QUARANTINED'); throw new Error(trust.errors.join('; ')); }
    if (!this.dependencies.onnxSessionFactory || model.modelFormat !== 'ONNX') throw new Error('No secure runtime adapter is available');
    const device = await this.analyzeDevice(); const capabilities = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect();
    const provider = device.deviceClass === 'BROWSER' ? new WebLocalRuntime().selectProvider(capabilities) : device.deviceClass === 'MOBILE' ? new MobileLocalRuntime().selectProvider(device, capabilities) : new DesktopLocalRuntime().selectProvider(device, capabilities);
    if (provider === 'BLOCKED') throw new Error('No allowed execution provider'); const runtime = new OnnxLocalRuntime(this.dependencies.onnxSessionFactory, [provider], this.dependencies.clock); await runtime.load(model, bytes); this.#runtimes.set(modelId, runtime);
  }

  async unloadModel(modelId: string): Promise<void> { const runtime = this.#runtimes.get(modelId); await runtime?.unload(); this.#runtimes.delete(modelId); }

  async infer(modelId: string, request: InferenceRequest): Promise<InferenceResult> {
    const model = this.#registry.get(modelId); if (!model || model.status !== 'READY') throw new Error('Quarantined or untrusted model inference is blocked'); const runtime = this.#runtimes.get(modelId); if (!runtime) throw new Error('Model is not loaded'); return runtime.infer(request);
  }

  async benchmarkModel(modelId: string, request: InferenceRequest): Promise<LocalModelBenchmark> {
    const model = this.#registry.get(modelId); const bytes = await this.dependencies.storage.read(modelId); if (!model || model.status !== 'READY' || !bytes) throw new Error('A trusted installed model is required');
    let runtime = this.#runtimes.get(modelId); if (!runtime) { await this.loadModel(modelId); runtime = this.#runtimes.get(modelId); } const result = await new LocalModelBenchmarker(this.dependencies.clock).run(runtime!, model, bytes, request); this.#benchmarks.set(modelId, result); return result;
  }

  benchmark(modelId: string): LocalModelBenchmark | undefined { return this.#benchmarks.get(modelId); }
  verifyResult(result: InferenceResult, requirements?: Parameters<LocalResultVerifier['verify']>[1]): ResultVerification { return new LocalResultVerifier().verify(result, requirements); }
  compareLocalCloud(local: Readonly<{ latencyMs: number; quality: number; cost: number }>, cloud: Readonly<{ latencyMs: number; quality: number; cost: number }>, qualityRequirement = 0) { return compare(local, cloud, qualityRequirement); }
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

  async #recommendFleet(snapshot: DeviceCapabilitySnapshot, policy?: ModelFleetRecommendationPolicy): Promise<ModelFleetRecommendation> {
    const catalog = this.dependencies.modelCatalog ?? [];
    const trust = await Promise.all(catalog.map(async (model) => Object.freeze({ key: modelFleetKey(model), trusted: (await this.verifyModel(model)).trusted })));
    let storageFreeBytes: number | 'UNKNOWN' = 'UNKNOWN';
    try {
      const available = await this.dependencies.storage.freeBytes();
      if (Number.isFinite(available) && available >= 0) storageFreeBytes = available;
    } catch { /* storage evidence remains UNKNOWN and recommendation fails closed */ }
    return new ModelFleetPlanner().recommend({
      snapshot,
      catalog,
      trustedModelKeys: trust.filter((item) => item.trusted).map((item) => item.key),
      storageFreeBytes,
      policy,
    });
  }
}

function legacyBundleId(snapshot: DeviceCapabilitySnapshot): ModelBundle['id'] {
  const device = snapshot.profile;
  if (device.deviceClass === 'BROWSER') return 'BROWSER';
  if (device.deviceClass === 'MOBILE') return device.tier === 'LOW' ? 'MOBILE_LOW' : 'MOBILE_HIGH';
  const accelerated = snapshot.runtimeCapabilities.CUDA === true || snapshot.runtimeCapabilities.METAL === true || snapshot.runtimeCapabilities.DIRECTML === true;
  return accelerated && (device.tier === 'HIGH' || device.tier === 'EXTREME') ? 'DESKTOP_GPU' : 'DESKTOP_STANDARD';
}
