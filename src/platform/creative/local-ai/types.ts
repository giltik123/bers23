export type UnknownValue = 'UNKNOWN';
export type Platform = 'ANDROID' | 'IOS' | 'WINDOWS' | 'MACOS' | 'LINUX' | 'BROWSER' | UnknownValue;
export type DeviceClass = 'MOBILE' | 'DESKTOP' | 'BROWSER' | UnknownValue;
export type DeviceTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
export type Availability = boolean | UnknownValue;
export type ThermalState = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | UnknownValue;
export type PowerState = 'CHARGING' | 'BATTERY' | 'FULL' | UnknownValue;
export type NetworkState = 'ONLINE' | 'OFFLINE' | 'METERED' | 'SLOW' | UnknownValue;
export type RamPressure = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | UnknownValue;
export type PrivacyMode = 'NORMAL' | 'PRIVACY_FIRST' | 'LOCAL_ONLY' | 'OFFLINE_ONLY';
export type ExecutionTarget = 'LOCAL' | 'CLOUD' | 'HYBRID' | 'BLOCKED';
export type ModelStatus = 'AVAILABLE' | 'DOWNLOADING' | 'VERIFYING' | 'INSTALLED' | 'READY' | 'OUTDATED' | 'DISABLED' | 'QUARANTINED' | 'FAILED' | 'REMOVING';
export type ModelFormat = 'ONNX' | 'TFLITE' | 'SAFETENSORS' | 'GGUF';
export type RuntimeKind = 'ONNX_RUNTIME' | 'WEBGPU' | 'WASM' | 'NNAPI' | 'DIRECTML' | 'CUDA' | 'METAL' | 'VULKAN';
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
export type InferenceContext = Readonly<{ prompt: string; operation: string; allowedArtifacts: readonly Readonly<{ id: string; value: unknown }>[]; sanitizedConstraints: Readonly<Record<string, unknown>>; allowedCapabilities: readonly string[]; modelParameters: Readonly<Record<string, unknown>>; scope: Scope }>;
export type LocalAISnapshot = Readonly<{ deviceProfile: DeviceCapabilityProfile; runtimeCapabilities: RuntimeCapabilities; installedModels: readonly ModelManifest[]; selectedModel?: ModelManifest; executionTarget: ExecutionTarget; resourceDecision: ResourceDecision; privacyPolicy: PrivacyMode; trustStatus: TrustResult | null; fallback: ExecutionTarget | null; timeline: readonly Readonly<{ sequence: number; event: string }>[] }>;

export interface DeviceProvider { signals(): Promise<DeviceSignals> }
export interface RuntimeProbe { detect(capability: RuntimeKind): Promise<Availability> }
export interface HashPort { sha256(bytes: Uint8Array): Promise<string> }
export interface SignaturePort { verify(publisher: string, signature: string, digest: string): Promise<boolean> }
export interface FetchPort { fetch(uri: string, offset: number, signal: AbortSignal): Promise<Uint8Array> }
export interface ModelStoragePort { freeBytes(): Promise<number>; read(modelId: string): Promise<Uint8Array | undefined>; write(modelId: string, bytes: Uint8Array): Promise<void>; remove(modelId: string): Promise<void> }
export interface LocalAIDependencies { id(): string; clock(): number; random(): number; deviceProvider: DeviceProvider; runtimeProbe: RuntimeProbe; fetch: FetchPort; storage: ModelStoragePort; hash: HashPort; signatureVerifier: SignaturePort }
