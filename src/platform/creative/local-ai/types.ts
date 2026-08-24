export type UnknownValue = 'UNKNOWN';
export type Platform = 'ANDROID' | 'IOS' | 'WINDOWS' | 'MACOS' | 'LINUX' | 'BROWSER' | UnknownValue;
export type DeviceClass = 'MOBILE' | 'DESKTOP' | 'BROWSER' | UnknownValue;
export type DeviceTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | UnknownValue;
export type Availability = boolean | UnknownValue;
export type ThermalState = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | UnknownValue;
export type PowerState = 'CHARGING' | 'BATTERY' | 'FULL' | UnknownValue;
export type NetworkState = 'ONLINE' | 'OFFLINE' | 'METERED' | 'SLOW' | UnknownValue;
export type RamPressure = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | UnknownValue;
export type PrivacyMode = 'NORMAL' | 'PRIVACY_FIRST' | 'LOCAL_ONLY' | 'OFFLINE_ONLY';
export type ExecutionTarget = 'LOCAL' | 'CLOUD' | 'HYBRID' | 'BLOCKED';
export type ModelStatus = 'AVAILABLE' | 'DOWNLOADING' | 'VERIFYING' | 'STAGED' | 'UPDATING' | 'ROLLING_BACK' | 'INSTALLED' | 'READY' | 'OUTDATED' | 'DISABLED' | 'QUARANTINED' | 'FAILED' | 'REMOVING';
export type ModelFormat = 'ONNX' | 'TFLITE' | 'SAFETENSORS' | 'GGUF';
export type RuntimeKind = 'ONNX_RUNTIME' | 'WEBGPU' | 'WASM' | 'NNAPI' | 'DIRECTML' | 'CUDA' | 'METAL' | 'VULKAN';
export type ExecutionProvider = 'webgpu' | 'wasm' | 'cuda' | 'dml' | 'coreml' | 'cpu' | 'nnapi';
export type Scope = Readonly<{ tenantId: string; projectId: string; userId: string }>;

export type DeviceSignals = Readonly<{
  platform?: Platform; deviceClass?: DeviceClass; cpuCores?: number; ramMb?: number; gpu?: string; vramMb?: number;
  npu?: string; architecture?: string; browser?: string; webgpu?: Availability; wasm?: Availability; webnn?: Availability;
  cuda?: Availability; directml?: Availability; metal?: Availability; vulkan?: Availability; storageFreeBytes?: number;
  batteryPercent?: number; powerState?: PowerState; thermalState?: ThermalState; network?: NetworkState;
  ramPressure?: RamPressure; backgroundRestricted?: Availability;
}>;
export type DeviceCapabilityProfile = Readonly<{
  platform: Platform; deviceClass: DeviceClass; cpuCores: number | UnknownValue; ramMb: number | UnknownValue;
  gpu: string | UnknownValue; vramMb: number | UnknownValue; npu: string | UnknownValue; architecture: string | UnknownValue;
  browser: string | UnknownValue; webgpu: Availability; wasm: Availability; webnn: Availability; cuda: Availability;
  directml: Availability; metal: Availability; vulkan: Availability; storageFreeBytes: number | UnknownValue;
  batteryPercent: number | UnknownValue; powerState: PowerState; thermalState: ThermalState; network: NetworkState; tier: DeviceTier;
  ramPressure: RamPressure; backgroundRestricted: Availability;
}>;
export type RuntimeCapabilities = Readonly<Record<RuntimeKind, Availability>>;
export type DeviceFleetCapabilityProfile = Readonly<{
  platform: Platform;
  deviceClass: DeviceClass;
  tier: DeviceTier;
  ramMb: number | UnknownValue;
  vramMb: number | UnknownValue;
  storageFreeBytes: number | UnknownValue;
}>;
export type DeviceCapabilitySnapshot = Readonly<{
  schemaVersion: 1;
  capturedAt: number;
  profile: DeviceFleetCapabilityProfile;
  runtimeCapabilities: RuntimeCapabilities;
  evidence: Readonly<{
    observedSignals: readonly string[];
    unknownSignals: readonly string[];
    observedRuntimes: readonly RuntimeKind[];
    unknownRuntimes: readonly RuntimeKind[];
  }>;
}>;

export type ModelManifest = Readonly<{
  modelId: string; version: string; family: string; capabilities: readonly string[]; modelFormat: ModelFormat; runtime: RuntimeKind;
  sizeBytes: number; requiredRam: number; requiredVram: number; supportedPlatforms: readonly Platform[];
  supportedAccelerators: readonly RuntimeKind[]; estimatedLatency: number; qualityScore: number; energyScore: number;
  privacyLevel: 'PUBLIC' | 'PRIVATE'; license: string; publisher: string; downloadUri: string; sha256: string;
  signature: string; status: ModelStatus; stabilityScore: number;
}>;
export type TrustResult = Readonly<{ trusted: boolean; checks: Readonly<Record<string, boolean>>; errors: readonly string[] }>;
export type ResourceDecision = Readonly<{ allowed: boolean; reasons: readonly string[]; suggestedTarget: ExecutionTarget }>;
export type SuitabilityScore = Readonly<{ modelId: string; eligible: boolean; score: number; factors: Readonly<Record<string, number>>; reasons: readonly string[] }>;
export type TargetRequest = Readonly<{
  operation: Readonly<{ operationId: string; requiredCapabilities: readonly string[]; executionPolicy?: string }>;
  device: DeviceCapabilityProfile; models: readonly ModelManifest[]; privacyMode: PrivacyMode; cloudAllowed: boolean;
  maxCloudCredits: number; cloudCredits: number; qualityRequirement: number; latencyRequirement: number; concurrentJobs?: number;
}>;
export type TargetDecision = Readonly<{ target: ExecutionTarget; model?: ModelManifest; reason: string; fallback: ExecutionTarget | null; resource: ResourceDecision; candidates: readonly SuitabilityScore[] }>;

export type ModelFleetRecommendationPolicy = Readonly<{
  bootstrapCapabilities?: readonly string[];
  maxAutoInstallBytes?: number;
  minFreeBytesAfterInstall?: number;
  maxModelBytes?: number;
  minQualityScore?: number;
  minStabilityScore?: number;
}>;
export type ModelFleetExclusionReason =
  | 'UNTRUSTED_MANIFEST'
  | 'UNSUPPORTED_PLATFORM'
  | 'RUNTIME_UNAVAILABLE'
  | 'UNSAFE_STATUS'
  | 'CAPABILITY_NOT_BOOTSTRAP'
  | 'HEAVY_CAPABILITY'
  | 'UNKNOWN_RAM'
  | 'INSUFFICIENT_RAM'
  | 'UNKNOWN_VRAM'
  | 'INSUFFICIENT_VRAM'
  | 'INSUFFICIENT_STORAGE'
  | 'QUALITY_BELOW_POLICY'
  | 'STABILITY_BELOW_POLICY'
  | 'MODEL_TOO_LARGE'
  | 'BUDGET_EXCEEDED'
  | 'CAPABILITY_ALREADY_COVERED'
  | 'MODEL_VERSION_ALREADY_SELECTED';
export type ModelFleetExclusion = Readonly<{ modelId: string; version: string; reasons: readonly ModelFleetExclusionReason[] }>;
export type ModelFleetRecommendationStatus = 'READY' | 'PARTIAL' | 'BLOCKED_INSUFFICIENT_EVIDENCE' | 'BLOCKED_STORAGE' | 'NO_COMPATIBLE_MODELS';
export type ModelFleetRecommendation = Readonly<{
  status: ModelFleetRecommendationStatus;
  modelIds: readonly string[];
  modelBindings: readonly Readonly<{ modelId: string; version: string }>[];
  estimatedBytes: number;
  budgetBytes: number | UnknownValue;
  freeBytes: number | UnknownValue;
  reserveBytes: number | UnknownValue;
  requestedCapabilities: readonly string[];
  uncoveredCapabilities: readonly string[];
  exclusions: readonly ModelFleetExclusion[];
}>;

export type InferenceContext = Readonly<{ prompt: string; operation: string; allowedArtifacts: readonly Readonly<{ id: string; value: unknown }>[]; sanitizedConstraints: Readonly<Record<string, unknown>>; allowedCapabilities: readonly string[]; modelParameters: Readonly<Record<string, unknown>>; scope: Scope }>;
export type LocalAISnapshot = Readonly<{ deviceProfile: DeviceCapabilityProfile; runtimeCapabilities: RuntimeCapabilities; installedModels: readonly ModelManifest[]; selectedModel?: ModelManifest; executionTarget: ExecutionTarget; resourceDecision: ResourceDecision; privacyPolicy: PrivacyMode; trustStatus: TrustResult | null; fallback: ExecutionTarget | null; timeline: readonly Readonly<{ sequence: number; event: string }>[] }>;
export type TensorValue = Readonly<{ data: ArrayLike<number>; dims: readonly number[]; type?: string }>;
export type InferenceRequest = Readonly<{ requestId: string; inputs: Readonly<Record<string, TensorValue>>; outputNames?: readonly string[] }>;
export type InferenceResult = Readonly<{ requestId: string; modelId: string; outputs: Readonly<Record<string, TensorValue>>; provider: ExecutionProvider; latencyMs: number; memoryBytes: number; artifact: LocalArtifact }>;
export type LocalArtifact = Readonly<{ id: string; kind: 'IMAGE' | 'MASK' | 'TEXT' | 'ANALYSIS' | 'TENSOR'; mimeType: string; width?: number; height?: number; data: unknown; metadata: Readonly<Record<string, unknown>> }>;
export type RuntimeHealth = Readonly<{ status: 'READY' | 'UNLOADED' | 'DEGRADED' | 'BLOCKED'; provider?: ExecutionProvider; message?: string }>;
export type RuntimeEstimate = Readonly<{ latencyMs: number; memoryBytes: number; energy: number }>;
export type RuntimeSnapshot = Readonly<{ loaded: boolean; modelId?: string; provider?: ExecutionProvider; activeRequests: number; lastLatencyMs?: number }>;
export interface LocalModelRuntime {
  load(model: ModelManifest, bytes: Uint8Array): Promise<void>; unload(): Promise<void>; infer(request: InferenceRequest): Promise<InferenceResult>;
  cancel(requestId: string): void; health(): RuntimeHealth; estimate(request?: InferenceRequest): RuntimeEstimate; snapshot(): RuntimeSnapshot; debug(): Readonly<Record<string, unknown>>;
}
export interface OnnxSession { run(inputs: Readonly<Record<string, TensorValue>>, outputNames?: readonly string[]): Promise<Readonly<Record<string, TensorValue>>>; release?(): Promise<void> | void }
export interface OnnxSessionFactory { create(bytes: Uint8Array, options: Readonly<{ executionProviders: readonly ExecutionProvider[] }>): Promise<OnnxSession> }
export type LocalModelBenchmark = Readonly<{ modelId: string; coldStartMs: number; warmStartMs: number; latencyMs: number; ramBytes: number; vramBytes: number; energyEstimate: number; successRate: number; outputDimensions: readonly number[]; provider: ExecutionProvider }>;
export type ModelBundle = Readonly<{ id: 'MOBILE_LOW' | 'MOBILE_HIGH' | 'DESKTOP_STANDARD' | 'DESKTOP_GPU' | 'BROWSER'; modelIds: readonly string[]; estimatedBytes: number; reasoning: 'YES' | 'LIMITED' | 'NO'; generation: 'NO' }>;
export type ModelPackDefinition = Readonly<{ id: 'IMAGE_ANALYSIS' | 'SEGMENTATION' | 'UPSCALE' | 'OCR' | 'LOCAL_REASONING'; family: string; capabilities: readonly string[]; optional: boolean; artifactKinds: readonly LocalArtifact['kind'][] }>;
export type ResultVerification = Readonly<{ valid: boolean; checks: Readonly<Record<string, boolean>>; errors: readonly string[] }>;
export type LocalCloudComparison = Readonly<{ target: 'LOCAL' | 'CLOUD'; localScore: number; cloudScore: number; reason: string }>;

export interface DeviceProvider { signals(): Promise<DeviceSignals> }
export interface RuntimeProbe { detect(capability: RuntimeKind): Promise<Availability> }
export interface HashPort { sha256(bytes: Uint8Array): Promise<string> }
export interface SignaturePort { verify(publisher: string, signature: string, digest: string): Promise<boolean> }
export interface FetchPort { fetch(uri: string, offset: number, signal: AbortSignal): Promise<Uint8Array> }
export interface ModelStoragePort { freeBytes(): Promise<number>; read(modelId: string): Promise<Uint8Array | undefined>; write(modelId: string, bytes: Uint8Array): Promise<void>; remove(modelId: string): Promise<void> }
export interface LocalAIDependencies { id(): string; clock(): number; random(): number; deviceProvider: DeviceProvider; runtimeProbe: RuntimeProbe; fetch: FetchPort; storage: ModelStoragePort; hash: HashPort; signatureVerifier: SignaturePort; onnxSessionFactory?: OnnxSessionFactory; modelCatalog?: readonly ModelManifest[] }
