import { LocalInferenceCache } from './cache/LocalInferenceCache';
import { LocalAICostModel } from './cost/LocalAICostModel';
import { LocalAIDebugger } from './debug/LocalAIDebugger';
import { DeviceAnalyzer } from './device/DeviceAnalyzer';
import { DeviceCapabilitySnapshotBuilder } from './device/DeviceCapabilitySnapshot';
import { LocalRuntimeDetector } from './device/LocalRuntimeDetector';
import { immutableClone } from './immutable';
import {
  DurableModelFleet,
  type FleetBlobPort,
  type FleetMetadataPort,
  type FleetMutationLockPort,
  type FleetPolicy,
  type FleetState,
  type FleetStorageReservationPort,
  type FleetVersion,
} from './lifecycle/DurableModelFleet';
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
import type {
  DeviceCapabilitySnapshot,
  InferenceRequest,
  InferenceResult,
  LocalAIDependencies,
  LocalAISnapshot,
  LocalModelBenchmark,
  LocalModelRuntime,
  ModelBundle,
  ModelFleetRecommendation,
  ModelFleetRecommendationPolicy,
  ModelManifest,
  ModelStatus,
  ResultVerification,
  TargetDecision,
  TargetRequest,
  TrustResult,
} from './types';

const DEFAULT_TRUST_POLICY: TrustPolicy = {
  publishers: [], formats: ['ONNX', 'TFLITE', 'SAFETENSORS', 'GGUF'],
  runtimes: ['ONNX_RUNTIME', 'WEBGPU', 'WASM', 'NNAPI', 'DIRECTML', 'CUDA', 'METAL', 'VULKAN'],
  licenses: ['Apache-2.0', 'MIT', 'BSD-3-Clause'],
};

/** Explicit lifecycle composition. Browser/native hosts own persistence and coordination adapters. */
export type LocalAIPlatformLifecycle = Readonly<{
  metadata: FleetMetadataPort;
  blobs: FleetBlobPort;
  mutationLocks: FleetMutationLockPort;
  reservations: FleetStorageReservationPort;
  policy?: Partial<FleetPolicy>;
}>;

export class LocalAIPlatform {
  readonly #registry = new LocalModelRegistry();
  readonly #verifier: ModelManifestVerifier;
  readonly #downloader: LocalModelDownloader;
  readonly #failures = new Map<string, number>();
  readonly #fleet?: DurableModelFleet;
  readonly #fleetBlobs?: FleetBlobPort;
  #fleetInitialization?: Promise<void>;
  readonly cache: LocalInferenceCache;
  readonly sandbox = new LocalAISandbox();
  readonly #runtimes = new Map<string, LocalModelRuntime>();
  readonly #benchmarks = new Map<string, LocalModelBenchmark>();
  #lastSnapshot?: LocalAISnapshot;

  constructor(
    private readonly dependencies: LocalAIDependencies,
    policy: TrustPolicy = DEFAULT_TRUST_POLICY,
    lifecycle?: LocalAIPlatformLifecycle,
  ) {
    const trust = new ModelTrustRegistry(policy);
    this.#verifier = new ModelManifestVerifier(trust, new ModelSignatureVerifier(dependencies.signatureVerifier), dependencies.hash);
    this.#downloader = new LocalModelDownloader(dependencies.fetch, dependencies.storage, this.#registry, this.#verifier);
    if (lifecycle) {
      this.#fleetBlobs = lifecycle.blobs;
      this.#fleet = new DurableModelFleet(
        lifecycle.metadata,
        lifecycle.blobs,
        dependencies.fetch,
        this.#verifier,
        lifecycle.mutationLocks,
        lifecycle.reservations,
        dependencies.clock,
        lifecycle.policy,
      );
    }
    this.cache = new LocalInferenceCache(dependencies.clock);
  }

  analyzeDevice() { return new DeviceAnalyzer(this.dependencies.deviceProvider).analyze(); }

  async capabilitySnapshot(): Promise<DeviceCapabilitySnapshot> {
    const device = await this.analyzeDevice();
    const runtimes = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect();
    return new DeviceCapabilitySnapshotBuilder().build(device, runtimes, this.dependencies.clock());
  }

  availableModels(): readonly ModelManifest[] { return this.#registry.list(); }
  durableLifecycleEnabled(): boolean { return Boolean(this.#fleet); }
  async initializeModelFleet(): Promise<void> { await this.#ensureFleetInitialized(); }

  async recommendModel(operation: TargetRequest['operation']): Promise<ModelManifest | undefined> {
    await this.#refreshFleetMirror();
    const device = await this.analyzeDevice();
    const runtimes = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect();
    const scorer = new ModelSuitabilityScorer();
    return this.#registry.list('READY')
      .map((model) => ({ model, result: scorer.score(model, operation.requiredCapabilities, device, runtimes) }))
      .filter((item) => item.result.eligible)
      .sort((a, b) => b.result.score - a.result.score || a.model.modelId.localeCompare(b.model.modelId))[0]?.model;
  }

  async recommendFleet(policy?: ModelFleetRecommendationPolicy): Promise<ModelFleetRecommendation> {
    return this.#recommendFleet(await this.capabilitySnapshot(), policy);
  }

  async installModel(manifest: ModelManifest): Promise<ModelManifest> {
    await this.#ensureFleetInitialized();
    const trust = await this.verifyModel(manifest);
    if (!trust.trusted) {
      if (this.#fleet) {
        try { await this.#fleet.install(manifest); } catch { await this.#syncFleetModel(manifest.modelId); }
      } else {
        this.#registry.get(manifest.modelId)
          ? this.#registry.updateStatus(manifest.modelId, 'QUARANTINED')
          : this.#registry.register({ ...manifest, status: 'QUARANTINED' });
      }
      throw new Error(trust.errors.join('; '));
    }
    const device = await this.analyzeDevice();
    const runtimes = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect();
    if (!manifest.supportedPlatforms.includes(device.platform) || runtimes[manifest.runtime] !== true || !new ResourceGovernor().evaluate(device, manifest).allowed) {
      throw new Error('Model is incompatible with device resources or runtime');
    }
    if (!this.#fleet) return this.#downloader.download(manifest);
    try {
      return this.#mirrorFleetRecord(await this.#fleet.install(manifest));
    } catch (error) {
      await this.#syncFleetModel(manifest.modelId);
      throw error;
    }
  }

  async removeModel(modelId: string): Promise<void> {
    if (!this.#fleet) { await this.#downloader.remove(modelId); return; }
    await this.#ensureFleetInitialized();
    await this.unloadModel(modelId);
    for (;;) {
      const state = await this.#fleet.state();
      const model = state.models[modelId];
      if (!model) break;
      const selected = model.activeVersion ?? Object.keys(model.versions).sort()[0];
      if (!selected) break;
      await this.#fleet.remove(modelId, selected);
    }
    await this.#syncFleetModel(modelId);
  }

  async recommendedBundle(): Promise<ModelBundle> {
    const snapshot = await this.capabilitySnapshot();
    const fleet = await this.#recommendFleet(snapshot);
    return immutableClone({
      id: legacyBundleId(snapshot),
      modelIds: fleet.modelIds,
      estimatedBytes: fleet.estimatedBytes,
      reasoning: 'NO' as const,
      generation: 'NO' as const,
    });
  }

  async installRecommendedBundle(): Promise<readonly ModelManifest[]> {
    const recommendation = await this.recommendFleet();
    if (recommendation.status !== 'READY' && recommendation.status !== 'PARTIAL') return Object.freeze([]);
    const catalog = this.dependencies.modelCatalog ?? [];
    const installed: ModelManifest[] = [];
    for (const binding of recommendation.modelBindings) {
      const manifest = catalog.find((item) => item.modelId === binding.modelId && item.version === binding.version);
      if (!manifest) throw new Error(`Recommended model binding is no longer available: ${binding.modelId}@${binding.version}`);
      installed.push(await this.installModel(manifest));
    }
    return immutableClone(installed);
  }

  async loadModel(modelId: string): Promise<void> {
    await this.#ensureFleetInitialized();
    const { model, bytes } = this.#fleet
      ? await this.#durableRuntimeArtifact(modelId)
      : await this.#legacyRuntimeArtifact(modelId);
    if (!this.dependencies.onnxSessionFactory || model.modelFormat !== 'ONNX') throw new Error('No secure runtime adapter is available');
    const device = await this.analyzeDevice();
    const capabilities = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect();
    const provider = device.deviceClass === 'BROWSER'
      ? new WebLocalRuntime().selectProvider(capabilities)
      : device.deviceClass === 'MOBILE'
        ? new MobileLocalRuntime().selectProvider(device, capabilities)
        : new DesktopLocalRuntime().selectProvider(device, capabilities);
    if (provider === 'BLOCKED') throw new Error('No allowed execution provider');
    const runtime = new OnnxLocalRuntime(this.dependencies.onnxSessionFactory, [provider], this.dependencies.clock);
    await runtime.load(model, bytes);
    this.#runtimes.set(modelId, runtime);
  }

  async unloadModel(modelId: string): Promise<void> {
    const runtime = this.#runtimes.get(modelId);
    await runtime?.unload();
    this.#runtimes.delete(modelId);
  }

  async infer(modelId: string, request: InferenceRequest): Promise<InferenceResult> {
    await this.#ensureFleetInitialized();
    const model = this.#registry.get(modelId);
    if (!model || model.status !== 'READY') throw new Error('Quarantined or untrusted model inference is blocked');
    if (this.#fleet) {
      const state = await this.#fleet.state();
      const durable = state.models[modelId];
      const active = durable?.activeVersion && durable.versions[durable.activeVersion];
      if (!active || active.status !== 'READY' || active.version !== model.version) {
        await this.unloadModel(modelId);
        await this.#syncFleetModel(modelId);
        throw new Error('Durable model authority changed; reload is required');
      }
    }
    const runtime = this.#runtimes.get(modelId);
    if (!runtime) throw new Error('Model is not loaded');
    return runtime.infer(request);
  }

  async benchmarkModel(modelId: string, request: InferenceRequest): Promise<LocalModelBenchmark> {
    await this.#ensureFleetInitialized();
    const artifact = this.#fleet
      ? await this.#durableRuntimeArtifact(modelId)
      : await this.#legacyRuntimeArtifact(modelId);
    let runtime = this.#runtimes.get(modelId);
    if (!runtime) { await this.loadModel(modelId); runtime = this.#runtimes.get(modelId); }
    const result = await new LocalModelBenchmarker(this.dependencies.clock).run(runtime!, artifact.model, artifact.bytes, request);
    this.#benchmarks.set(modelId, result);
    return result;
  }

  benchmark(modelId: string): LocalModelBenchmark | undefined { return this.#benchmarks.get(modelId); }
  verifyResult(result: InferenceResult, requirements?: Parameters<LocalResultVerifier['verify']>[1]): ResultVerification { return new LocalResultVerifier().verify(result, requirements); }
  compareLocalCloud(local: Readonly<{ latencyMs: number; quality: number; cost: number }>, cloud: Readonly<{ latencyMs: number; quality: number; cost: number }>, qualityRequirement = 0) { return compare(local, cloud, qualityRequirement); }
  verifyModel(manifest: ModelManifest, bytes?: Uint8Array): Promise<TrustResult> { return this.#verifier.verify(manifest, bytes); }

  async selectExecutionTarget(request: Omit<TargetRequest, 'device' | 'models'>): Promise<TargetDecision> {
    await this.#refreshFleetMirror();
    const device = await this.analyzeDevice();
    const runtimeCapabilities = await new LocalRuntimeDetector(this.dependencies.runtimeProbe).detect();
    const decision = new ExecutionTargetSelector(runtimeCapabilities).select({ ...request, device, models: this.#registry.list('READY') });
    const trustStatus = decision.model ? await this.verifyModel(decision.model) : null;
    const safeDecision = trustStatus && !trustStatus.trusted
      ? { ...decision, target: 'BLOCKED' as const, model: undefined, reason: 'Selected model failed trust validation', fallback: null }
      : decision;
    this.#lastSnapshot = immutableClone({
      deviceProfile: device,
      runtimeCapabilities,
      installedModels: this.#registry.list(),
      selectedModel: safeDecision.model,
      executionTarget: safeDecision.target,
      resourceDecision: safeDecision.resource,
      privacyPolicy: request.privacyMode,
      trustStatus,
      fallback: safeDecision.fallback,
      timeline: [
        { sequence: 1, event: `operation:${request.operation.operationId}` },
        { sequence: 2, event: `target:${safeDecision.target}` },
      ],
    });
    return immutableClone(safeDecision);
  }

  estimate(modelId: string | undefined, cloudCredits: number, privacyValue: number) { return new LocalAICostModel().estimate(modelId ? this.#registry.get(modelId) : undefined, cloudCredits, privacyValue); }
  inspect(modelId: string): ModelManifest | undefined { return this.#registry.get(modelId); }
  snapshot(): LocalAISnapshot | undefined { return this.#lastSnapshot; }
  debug() { return this.#lastSnapshot ? new LocalAIDebugger().inspect(this.#lastSnapshot) : undefined; }
  explain(): string | undefined { return this.#lastSnapshot ? new LocalAIDebugger().explain(this.#lastSnapshot) : undefined; }
  replay(snapshot: LocalAISnapshot): LocalAISnapshot { return immutableClone(snapshot) as LocalAISnapshot; }

  pauseDownload(modelId: string): void {
    if (this.#fleet) throw new Error('Durable model download pause requires the durable async control surface');
    this.#downloader.pause(modelId);
  }

  resumeDownload(manifest: ModelManifest): Promise<ModelManifest> {
    if (!this.#fleet) return this.#downloader.resume(manifest);
    return this.#ensureFleetInitialized()
      .then(() => this.#fleet!.resume(manifest))
      .then((record) => this.#mirrorFleetRecord(record));
  }

  cancelDownload(modelId: string): void {
    if (this.#fleet) throw new Error('Durable model download cancellation requires the durable async control surface');
    this.#downloader.cancel(modelId);
  }

  /** @deprecated Compatibility-only synchronous rollback. Durable production callers must use rollbackModelAsync(). */
  rollbackModel(modelId: string): ModelManifest {
    if (this.#fleet) throw new Error('Durable model rollback requires rollbackModelAsync()');
    return this.#downloader.rollback(modelId);
  }

  async rollbackModelAsync(modelId: string): Promise<ModelManifest> {
    if (!this.#fleet) return this.rollbackModel(modelId);
    await this.#ensureFleetInitialized();
    await this.unloadModel(modelId);
    return this.#mirrorFleetRecord(await this.#fleet.rollback(modelId));
  }

  /** @deprecated Compatibility-only synchronous failure accounting. Durable production callers must use reportRuntimeFailureAsync(). */
  reportRuntimeFailure(modelId: string): ModelManifest {
    if (this.#fleet) throw new Error('Durable runtime failure accounting requires reportRuntimeFailureAsync()');
    const count = (this.#failures.get(modelId) ?? 0) + 1;
    this.#failures.set(modelId, count);
    return count >= 3 ? this.#registry.updateStatus(modelId, 'QUARANTINED') : this.#registry.updateStatus(modelId, 'FAILED');
  }

  async reportRuntimeFailureAsync(modelId: string, reason = 'runtime failure'): Promise<ModelManifest> {
    if (!this.#fleet) return this.reportRuntimeFailure(modelId);
    await this.#ensureFleetInitialized();
    await this.unloadModel(modelId);
    return this.#mirrorFleetRecord(await this.#fleet.reportFailure(modelId, reason));
  }

  /** @deprecated Compatibility-only synchronous restore. Durable production callers must use restoreQuarantinedAsync(). */
  restoreQuarantined(modelId: string, explicitlyAllowed: boolean): ModelManifest {
    if (this.#fleet) throw new Error('Durable quarantine restore requires restoreQuarantinedAsync()');
    if (!explicitlyAllowed) throw new Error('Explicit recovery policy is required');
    this.#failures.delete(modelId);
    return this.#registry.updateStatus(modelId, 'READY');
  }

  async restoreQuarantinedAsync(modelId: string, explicitlyAllowed: boolean): Promise<ModelManifest> {
    if (!this.#fleet) return this.restoreQuarantined(modelId, explicitlyAllowed);
    await this.#ensureFleetInitialized();
    return this.#mirrorFleetRecord(await this.#fleet.restoreQuarantined(modelId, explicitlyAllowed));
  }

  async #recommendFleet(snapshot: DeviceCapabilitySnapshot, policy?: ModelFleetRecommendationPolicy): Promise<ModelFleetRecommendation> {
    const catalog = this.dependencies.modelCatalog ?? [];
    const trust = await Promise.all(catalog.map(async (model) => Object.freeze({
      key: modelFleetKey(model),
      trusted: (await this.verifyModel(model)).trusted,
    })));
    let storageFreeBytes: number | 'UNKNOWN' = 'UNKNOWN';
    try {
      const available = this.#fleetBlobs
        ? await this.#fleetBlobs.freeBytes()
        : await this.dependencies.storage.freeBytes();
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

  async #ensureFleetInitialized(): Promise<void> {
    if (!this.#fleet) return;
    this.#fleetInitialization ??= (async () => {
      const state = await this.#fleet!.reconcile();
      this.#mirrorFleetState(state);
    })();
    await this.#fleetInitialization;
  }

  async #refreshFleetMirror(): Promise<void> {
    await this.#ensureFleetInitialized();
    if (this.#fleet) this.#mirrorFleetState(await this.#fleet.state());
  }

  #mirrorFleetState(state: FleetState): void {
    for (const current of this.#registry.list()) {
      if (!state.models[current.modelId]) this.#registry.remove(current.modelId);
    }
    for (const model of Object.values(state.models)) {
      const selected = model.activeVersion ? model.versions[model.activeVersion] : newestRecord(model.versions);
      if (selected) this.#mirrorFleetRecord(selected);
    }
  }

  async #syncFleetModel(modelId: string): Promise<ModelManifest | undefined> {
    if (!this.#fleet) return this.#registry.get(modelId);
    const state = await this.#fleet.state();
    const model = state.models[modelId];
    if (!model) {
      if (this.#registry.get(modelId)) this.#registry.remove(modelId);
      return undefined;
    }
    const selected = model.activeVersion ? model.versions[model.activeVersion] : newestRecord(model.versions);
    return selected ? this.#mirrorFleetRecord(selected) : undefined;
  }

  #mirrorFleetRecord(record: FleetVersion): ModelManifest {
    const manifest = immutableClone({ ...record.manifest, status: record.status as ModelStatus }) as ModelManifest;
    const current = this.#registry.get(record.modelId);
    if (!current) return this.#registry.register(manifest);
    if (current.version === manifest.version) return this.#registry.updateStatus(record.modelId, manifest.status);
    this.#registry.remove(record.modelId);
    return this.#registry.register(manifest);
  }

  async #legacyRuntimeArtifact(modelId: string): Promise<Readonly<{ model: ModelManifest; bytes: Uint8Array }>> {
    const model = this.#registry.get(modelId);
    if (!model || model.status !== 'READY') throw new Error('Only trusted READY models can be loaded');
    const bytes = await this.dependencies.storage.read(modelId);
    if (!bytes) throw new Error('Installed model artifact is missing');
    const trust = await this.verifyModel(model, bytes);
    if (!trust.trusted) {
      this.#registry.updateStatus(modelId, 'QUARANTINED');
      throw new Error(trust.errors.join('; '));
    }
    return Object.freeze({ model, bytes });
  }

  async #durableRuntimeArtifact(modelId: string): Promise<Readonly<{ model: ModelManifest; bytes: Uint8Array }>> {
    const state = await this.#fleet!.state();
    const durable = state.models[modelId];
    const record = durable?.activeVersion && durable.versions[durable.activeVersion];
    if (!record || record.status !== 'READY' || !record.contentHash) throw new Error('Only durable trusted READY models can be loaded');
    const bytes = await this.#fleetBlobs!.read(record.contentHash);
    const trust = bytes && bytes.byteLength === record.manifest.sizeBytes ? await this.verifyModel(record.manifest, bytes) : undefined;
    if (!bytes || !trust?.trusted) {
      await this.#fleet!.reconcile();
      await this.#syncFleetModel(modelId);
      throw new Error('Durable active model failed integrity revalidation');
    }
    return Object.freeze({ model: this.#mirrorFleetRecord(record), bytes });
  }
}

function legacyBundleId(snapshot: DeviceCapabilitySnapshot): ModelBundle['id'] {
  const device = snapshot.profile;
  if (device.deviceClass === 'BROWSER') return 'BROWSER';
  if (device.deviceClass === 'MOBILE') {
    return device.tier === 'HIGH' || device.tier === 'EXTREME' ? 'MOBILE_HIGH' : 'MOBILE_LOW';
  }
  const accelerated = snapshot.runtimeCapabilities.CUDA === true
    || snapshot.runtimeCapabilities.METAL === true
    || snapshot.runtimeCapabilities.DIRECTML === true;
  return accelerated && (device.tier === 'HIGH' || device.tier === 'EXTREME') ? 'DESKTOP_GPU' : 'DESKTOP_STANDARD';
}

function newestRecord(versions: Readonly<Record<string, FleetVersion>>): FleetVersion | undefined {
  return Object.values(versions).sort((a, b) => b.updatedAt - a.updatedAt || b.version.localeCompare(a.version))[0];
}
