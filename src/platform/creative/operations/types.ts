export const OPERATION_CAPABILITIES = [
  'SEGMENTATION',
  'GENERATION',
  'MASKING',
  'UPSCALE',
  'STYLE',
  'LOCAL',
  'GPU',
  'AI',
] as const;

export const OPERATION_FAMILIES = [
  'Editing',
  'Generation',
  'Restoration',
  'Composition',
  'Lighting',
  'Mask',
  'Geometry',
  'Encoding',
  'Verification',
  'Analysis',
] as const;

export type OperationCapability = typeof OPERATION_CAPABILITIES[number];
export type OperationFamily = typeof OPERATION_FAMILIES[number];
export type ExecutionPolicy = 'LOCAL_ONLY' | 'CLOUD_ONLY' | 'LOCAL_PREFERRED' | 'CLOUD_PREFERRED' | 'HYBRID';
export type ArtifactFormat = 'PNG' | 'JPEG' | 'WEBP' | 'MASK' | 'LAYER' | 'IMAGE';
export type OperationScope = Readonly<{ tenantId: string; projectId: string; userId: string }>;

export type ResourceProfile = Readonly<{
  cpu: number;
  gpu: number;
  ramMb: number;
  vramMb: number;
  credits: number;
  latencyMs: number;
  diskMb: number;
  networkMb: number;
  expectedQualityGain: number;
}>;

export type CompatibilityRequirements = Readonly<{
  formats: readonly ArtifactFormat[];
  requiresAlpha?: boolean;
  requiresLayers?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  bitDepths?: readonly number[];
}>;

export type ArtifactMetadata = Readonly<{
  format: ArtifactFormat;
  width: number;
  height: number;
  bitDepth: number;
  alpha: boolean;
  layers: number;
}>;

export type ParameterRule = Readonly<{
  type: 'number' | 'boolean' | 'string';
  required?: boolean;
  integer?: boolean;
  minimum?: number;
  maximum?: number;
  values?: readonly (string | number | boolean)[];
}>;

export type OperationDescriptor = Readonly<{
  operationId: string;
  displayName: string;
  category: OperationFamily;
  version: string;
  requiredCapabilities: readonly OperationCapability[];
  inputArtifacts: readonly string[];
  outputArtifacts: readonly string[];
  resources: ResourceProfile;
  supportsLocal: boolean;
  supportsCloud: boolean;
  supportsHybrid: boolean;
  executionPolicy: ExecutionPolicy;
  compatibility: CompatibilityRequirements;
  parameters: Readonly<Record<string, ParameterRule>>;
  verificationRequirements: readonly string[];
  rollbackSupport: boolean;
  safety: Readonly<{
    destructive: boolean;
    requiresVerification: boolean;
    producesAIContent: boolean;
    preservesIdentity: boolean;
  }>;
}>;

export type ValidationResult = Readonly<{ valid: boolean; errors: readonly string[] }>;
export type CompatibilityResult = Readonly<{ compatible: boolean; errors: readonly string[] }>;
export type CapabilityResult = Readonly<{ matched: boolean; missing: readonly OperationCapability[] }>;
export type OptimizationDecision = Readonly<{
  ruleId: string;
  applied: boolean;
  operationIds: readonly string[];
  replacementIds: readonly string[];
  reason: string;
}>;

export type OperationDecision = Readonly<{
  operationId: string;
  selected: boolean;
  route: 'LOCAL' | 'CLOUD' | 'HYBRID' | 'NONE';
  reason: string;
  rejectedAlternatives: readonly Readonly<{ operationId: string; reason: string }>[];
}>;

export type OperationSnapshot = Readonly<{
  descriptor: OperationDescriptor;
  capabilities: CapabilityResult;
  resources: ResourceProfile;
  validation: ValidationResult;
  compatibility: CompatibilityResult;
  optimization: readonly OptimizationDecision[];
  policy: ExecutionPolicy;
  verification: readonly string[];
  decision: OperationDecision;
  scope: OperationScope;
}>;

export interface CapabilityProvider {
  available(scope: OperationScope): readonly OperationCapability[];
}

export interface ExecutionEnvironmentProvider {
  localAvailable(scope: OperationScope): boolean;
  cloudAvailable(scope: OperationScope): boolean;
}
