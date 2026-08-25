import type {
  DeviceCapabilitySnapshot,
  InferenceRequest,
  InferenceResult,
  OnnxSessionFactory,
} from '../../platform/creative/local-ai/types';
import type { DeviceExecutionAdmission } from '../../platform/creative/local-ai/selection/DeviceExecutionAdmission';
import type { TrustPolicy } from '../../platform/creative/local-ai/trust/ModelTrust';

export const FLEET_RECONCILIATION_DEFERRED = 'DEFERRED_NO_AUTHENTICATED_CATALOG' as const;

export type BrowserFleetPreflight = Readonly<{
  catalogModelCount: number;
  durableLifecycleConfigured: boolean;
  durableBenchmarkEvidenceConfigured: boolean;
  reconciliation: typeof FLEET_RECONCILIATION_DEFERRED | 'AUTHORIZED';
}>;

export type BrowserModelExecutionPort = Readonly<{
  infer(input: Readonly<{
    model: Readonly<{ modelId: string; version: string }>;
    capability: string;
    request: InferenceRequest;
  }>): Promise<InferenceResult>;
}>;

export type BrowserLocalAIComposition = Readonly<{
  capabilitySnapshot(): Promise<DeviceCapabilitySnapshot>;
  fleetPreflight(): BrowserFleetPreflight;
  deviceAdmission: DeviceExecutionAdmission;
  onnxSessionFactory: OnnxSessionFactory;
  /** Exact-binding execution only; exposes no install/remove/promotion authority. */
  modelExecution: BrowserModelExecutionPort;
}>;

/**
 * Process-scoped lazy holder. Importing this module performs no hardware probe, IndexedDB open,
 * Web Lock request or model download. A failed initialization is not cached, so a later user intent
 * may retry after a transient browser/storage failure.
 */
export class LazyBrowserLocalAIComposition {
  #pending?: Promise<BrowserLocalAIComposition>;

  constructor(private readonly factory: () => Promise<BrowserLocalAIComposition> = createProductionBrowserLocalAIComposition) {}

  initialized(): boolean { return Boolean(this.#pending); }

  get(): Promise<BrowserLocalAIComposition> {
    if (this.#pending) return this.#pending;
    const pending = this.factory().catch((error) => {
      if (this.#pending === pending) this.#pending = undefined;
      throw error;
    });
    this.#pending = pending;
    return pending;
  }
}

export const browserLocalAIComposition = new LazyBrowserLocalAIComposition();

/**
 * Current production generic fleet catalog is intentionally empty.
 * MobileSAM 1.0.2 is a signed split encoder/decoder CANDIDATE pack and is executed only through its
 * dedicated Core-authorized adapter. Real-ESRGAN C3 is also CANDIDATE/EXPORT_REQUIRED and therefore
 * must not enter this generic READY fleet until its separate release-evidence promotion succeeds.
 */
export const PRODUCTION_BROWSER_FLEET_MODEL_COUNT = 0 as const;

const EMPTY_BROWSER_TRUST_POLICY: TrustPolicy = Object.freeze({
  publishers: Object.freeze([] as string[]),
  formats: Object.freeze(['ONNX', 'TFLITE', 'SAFETENSORS', 'GGUF'] as const),
  runtimes: Object.freeze(['ONNX_RUNTIME', 'WEBGPU', 'WASM', 'NNAPI', 'DIRECTML', 'CUDA', 'METAL', 'VULKAN'] as const),
  licenses: Object.freeze(['Apache-2.0', 'MIT', 'BSD-3-Clause'] as const),
});

/**
 * Durable reconciliation re-verifies persisted READY records with the current trust policy. It is
 * therefore authorized only when both an authenticated production catalog and its publisher policy
 * are present. Empty/untrusted catalog state must never quarantine previously valid durable state.
 */
export function browserFleetReconciliationAuthorized(modelCount: number, publisherCount: number): boolean {
  return Number.isSafeInteger(modelCount) && modelCount > 0
    && Number.isSafeInteger(publisherCount) && publisherCount > 0;
}

export async function initializeBrowserFleetIfAuthorized(
  initialize: () => Promise<void>,
  modelCount: number,
  publisherCount: number,
): Promise<boolean> {
  if (!browserFleetReconciliationAuthorized(modelCount, publisherCount)) return false;
  await initialize();
  return true;
}

async function createProductionBrowserLocalAIComposition(): Promise<BrowserLocalAIComposition> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') throw new Error('Browser Local AI composition requires a browser runtime');
  const [
    { LocalAIPlatform },
    { BrowserDeviceProvider, BrowserRuntimeProbe },
    { BrowserOnnxSessionFactory },
    { DeviceExecutionAdmission },
    { createBrowserFleetPersistence },
    { IndexedDbBenchmarkEvidencePort },
  ] = await Promise.all([
    import('../../platform/creative/local-ai/LocalAIPlatform'),
    import('../../platform/creative/local-ai/device/BrowserDeviceCapabilities'),
    import('../../platform/creative/local-ai/browser/BrowserOnnxSessionFactory'),
    import('../../platform/creative/local-ai/selection/DeviceExecutionAdmission'),
    import('../../platform/creative/local-ai/lifecycle/IndexedDbFleetStorage'),
    import('../../platform/creative/local-ai/benchmark/BenchmarkEvidencePersistence'),
  ]);

  const deviceProvider = new BrowserDeviceProvider();
  const runtimeProbe = new BrowserRuntimeProbe();
  const deviceAdmission = new DeviceExecutionAdmission(deviceProvider, runtimeProbe);
  const onnxSessionFactory = new BrowserOnnxSessionFactory();
  const lifecycle = createBrowserFleetPersistence();
  const dependencies = Object.freeze({
    id: browserId,
    clock: Date.now,
    random: browserRandom,
    deviceProvider,
    runtimeProbe,
    fetch: Object.freeze({ fetch: browserFetchBytes }),
    storage: disabledLegacyStorage(),
    hash: Object.freeze({ sha256: browserSha256 }),
    // No generic production model catalog is authorized yet. Signature admission therefore
    // fails closed even if a caller accidentally attempts to inject a manifest through this host.
    signatureVerifier: Object.freeze({ verify: async () => false }),
    onnxSessionFactory,
    modelCatalog: Object.freeze([]),
  });
  const platform = new LocalAIPlatform(
    dependencies,
    EMPTY_BROWSER_TRUST_POLICY,
    lifecycle,
    Object.freeze({ evidence: new IndexedDbBenchmarkEvidencePort(), criteria: Object.freeze([]) }),
  );
  const reconciled = await initializeBrowserFleetIfAuthorized(
    () => platform.initializeModelFleet(),
    dependencies.modelCatalog.length,
    EMPTY_BROWSER_TRUST_POLICY.publishers.length,
  );

  const fleetPreflight: BrowserFleetPreflight = Object.freeze({
    catalogModelCount: dependencies.modelCatalog.length,
    durableLifecycleConfigured: platform.durableLifecycleEnabled(),
    durableBenchmarkEvidenceConfigured: platform.durableBenchmarkEvidenceEnabled(),
    reconciliation: reconciled ? 'AUTHORIZED' : FLEET_RECONCILIATION_DEFERRED,
  });

  const loading = new Map<string, Promise<void>>();
  const modelExecution: BrowserModelExecutionPort = Object.freeze({
    async infer(input) {
      const modelId = input.model.modelId?.trim();
      const version = input.model.version?.trim();
      const capability = input.capability?.trim();
      if (!modelId || !version || !capability) throw new Error('Exact browser model execution binding is incomplete');
      const manifest = platform.inspect(modelId);
      if (!manifest || manifest.version !== version || manifest.status !== 'READY' || !manifest.capabilities.includes(capability)) {
        // Crucially, fail before initialize/load/download. An unauthenticated empty catalog must not
        // become authority merely because a Core ticket names a model.
        throw new Error(`Trusted browser model binding unavailable: ${modelId}@${version} (${capability})`);
      }
      const admission = await deviceAdmission.admit(manifest, [capability], 'LOCAL_ONLY');
      if (admission.allowed === false) throw new Error(`Trusted browser model is not admissible on this device: ${admission.reasons.join('; ') || 'device admission denied'}`);
      const key = `${modelId}@${version}`;
      let pending = loading.get(key);
      if (!pending) {
        pending = platform.loadModel(modelId).catch((error) => { loading.delete(key); throw error; });
        loading.set(key, pending);
      }
      await pending;
      const result = await platform.infer(modelId, input.request);
      if (result.modelId !== modelId) throw new Error('Local model runtime returned an unexpected model identity');
      return result;
    },
  });

  return Object.freeze({
    capabilitySnapshot: () => platform.capabilitySnapshot(),
    fleetPreflight: () => fleetPreflight,
    deviceAdmission,
    onnxSessionFactory,
    modelExecution,
  });
}

function browserId(): string {
  const crypto = browserCrypto();
  if (typeof crypto.randomUUID !== 'function') throw new Error('Secure browser UUID generation is unavailable');
  return crypto.randomUUID();
}

function browserRandom(): number {
  const values = new Uint32Array(1);
  browserCrypto().getRandomValues(values);
  return values[0] / 0x1_0000_0000;
}

async function browserSha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await browserCrypto().subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function browserCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is required for browser Local AI');
  return globalThis.crypto;
}

async function browserFetchBytes(uri: string, offset: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!/^https:\/\//.test(uri)) throw new Error('Local model downloads require HTTPS');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid local model download offset');
  const response = await fetch(uri, {
    method: 'GET',
    signal,
    credentials: 'omit',
    headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
  });
  if (!response.ok) throw new Error(`Local model download failed (${response.status})`);
  if (offset > 0 && response.status !== 206) throw new Error('Local model resume requires HTTP partial-content support');
  return new Uint8Array(await response.arrayBuffer());
}

function disabledLegacyStorage() {
  return Object.freeze({
    async freeBytes() {
      try {
        const estimate = await navigator.storage?.estimate?.();
        const quota = typeof estimate?.quota === 'number' ? estimate.quota : 0;
        const usage = typeof estimate?.usage === 'number' ? estimate.usage : quota;
        return Math.max(0, quota - usage);
      } catch { return 0; }
    },
    async read(_modelId: string): Promise<Uint8Array | undefined> { throw new Error('Legacy browser model storage is disabled; durable CAS is authoritative'); },
    async write(_modelId: string, _bytes: Uint8Array): Promise<void> { throw new Error('Legacy browser model storage is disabled; durable CAS is authoritative'); },
    async remove(_modelId: string): Promise<void> { throw new Error('Legacy browser model storage is disabled; durable CAS is authoritative'); },
  });
}
