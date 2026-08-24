import type { LocalAIPlatform } from '../../platform/creative/local-ai/LocalAIPlatform';
import type { DeviceExecutionAdmission } from '../../platform/creative/local-ai/selection/DeviceExecutionAdmission';
import type { OnnxSessionFactory } from '../../platform/creative/local-ai/types';

export type BrowserLocalAIComposition = Readonly<{
  platform: LocalAIPlatform;
  deviceAdmission: DeviceExecutionAdmission;
  onnxSessionFactory: OnnxSessionFactory;
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
 * dedicated Core-authorized adapter. It must not be represented as one generic READY model blob.
 */
export const PRODUCTION_BROWSER_FLEET_MODEL_COUNT = 0 as const;

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
    // No generic production model catalog is authorized in C0. Signature admission therefore
    // fails closed even if a caller accidentally attempts to inject a manifest through this host.
    signatureVerifier: Object.freeze({ verify: async () => false }),
    onnxSessionFactory,
    modelCatalog: Object.freeze([]),
  });
  const platform = new LocalAIPlatform(
    dependencies,
    Object.freeze({
      publishers: Object.freeze([]),
      formats: Object.freeze(['ONNX', 'TFLITE', 'SAFETENSORS', 'GGUF']),
      runtimes: Object.freeze(['ONNX_RUNTIME', 'WEBGPU', 'WASM', 'NNAPI', 'DIRECTML', 'CUDA', 'METAL', 'VULKAN']),
      licenses: Object.freeze(['Apache-2.0', 'MIT', 'BSD-3-Clause']),
    }),
    lifecycle,
    Object.freeze({ evidence: new IndexedDbBenchmarkEvidencePort(), criteria: Object.freeze([]) }),
  );
  await platform.initializeModelFleet();
  return Object.freeze({
    platform,
    deviceAdmission: new DeviceExecutionAdmission(deviceProvider, runtimeProbe),
    onnxSessionFactory,
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
  const digest = await browserCrypto().subtle.digest('SHA-256', bytes);
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
