import { immutableOperationClone } from '../immutable';
import type { ExecutionPolicy, OperationDescriptor, OperationFamily, ParameterRule, ResourceProfile } from '../types';

const localResources: ResourceProfile = {
  cpu: 2,
  gpu: 0,
  ramMb: 128,
  vramMb: 0,
  credits: 0,
  latencyMs: 30,
  diskMb: 2,
  networkMb: 0,
  expectedQualityGain: 0.05,
};

const aiResources: ResourceProfile = {
  cpu: 1,
  gpu: 4,
  ramMb: 1024,
  vramMb: 2048,
  credits: 8,
  latencyMs: 4_000,
  diskMb: 16,
  networkMb: 8,
  expectedQualityGain: 0.35,
};

const numberRule = (minimum: number, maximum: number, integer = false): ParameterRule => ({
  type: 'number',
  required: true,
  minimum,
  maximum,
  integer,
});

type DescriptorSeed = Readonly<{
  id: string;
  name: string;
  category: OperationFamily;
  ai?: boolean;
  policy?: ExecutionPolicy;
  input?: readonly string[];
  output?: readonly string[];
  parameters?: Readonly<Record<string, ParameterRule>>;
  destructive?: boolean;
  identity?: boolean;
  capabilities?: OperationDescriptor['requiredCapabilities'];
  alpha?: boolean;
  layers?: boolean;
}>;

function descriptor(seed: DescriptorSeed): OperationDescriptor {
  const ai = seed.ai ?? false;
  const policy = seed.policy ?? (ai ? 'CLOUD_PREFERRED' : 'LOCAL_PREFERRED');
  return {
    operationId: seed.id,
    displayName: seed.name,
    category: seed.category,
    version: '1.0.0',
    requiredCapabilities: seed.capabilities ?? (ai ? ['AI', 'GPU'] : ['LOCAL']),
    inputArtifacts: seed.input ?? ['image'],
    outputArtifacts: seed.output ?? ['image'],
    resources: ai ? aiResources : localResources,
    supportsLocal: policy !== 'CLOUD_ONLY',
    supportsCloud: policy !== 'LOCAL_ONLY',
    supportsHybrid: policy === 'HYBRID',
    executionPolicy: policy,
    compatibility: {
      formats: seed.input?.includes('mask') ? ['MASK', 'PNG'] : ['PNG', 'JPEG', 'WEBP', 'IMAGE'],
      requiresAlpha: seed.alpha,
      requiresLayers: seed.layers,
      minWidth: 1,
      minHeight: 1,
      maxWidth: 16_384,
      maxHeight: 16_384,
      bitDepths: [8, 16],
    },
    parameters: seed.parameters ?? {},
    verificationRequirements: ai ? ['artifact-integrity', 'dimensions', 'ai-content'] : ['artifact-integrity', 'dimensions'],
    rollbackSupport: true,
    safety: {
      destructive: seed.destructive ?? false,
      requiresVerification: true,
      producesAIContent: ai,
      preservesIdentity: seed.identity ?? true,
    },
  };
}

export const canonicalOperationDescriptors: readonly OperationDescriptor[] = immutableOperationClone([
  descriptor({ id: 'remove-background', name: 'Remove Background', category: 'Mask', ai: true, capabilities: ['SEGMENTATION', 'MASKING', 'AI'], output: ['image', 'mask'], alpha: true }),
  descriptor({ id: 'resize', name: 'Resize', category: 'Geometry', parameters: { width: numberRule(1, 16_384, true), height: numberRule(1, 16_384, true), mode: { type: 'string', required: true, values: ['fit', 'fill', 'stretch'] }, keepAspect: { type: 'boolean' } } }),
  descriptor({ id: 'rotate', name: 'Rotate', category: 'Geometry', parameters: { degrees: numberRule(-360, 360) } }),
  descriptor({ id: 'crop', name: 'Crop', category: 'Geometry', parameters: { x: numberRule(0, 16_384, true), y: numberRule(0, 16_384, true), width: numberRule(1, 16_384, true), height: numberRule(1, 16_384, true) } }),
  descriptor({ id: 'relight', name: 'Relight', category: 'Lighting', ai: true, capabilities: ['AI', 'GPU'] }),
  descriptor({ id: 'segment', name: 'Segment', category: 'Mask', ai: true, capabilities: ['SEGMENTATION', 'MASKING', 'AI'], output: ['mask'] }),
  descriptor({ id: 'upscale', name: 'Upscale', category: 'Restoration', ai: true, capabilities: ['UPSCALE', 'AI', 'GPU'], parameters: { factor: { type: 'number', required: true, values: [2, 4, 8] }, quality: { type: 'string', required: true, values: ['balanced', 'high', 'maximum'] } } }),
  descriptor({ id: 'outpaint', name: 'Outpaint', category: 'Generation', ai: true, capabilities: ['GENERATION', 'AI', 'GPU'], parameters: { pixels: numberRule(1, 4_096, true) }, destructive: true }),
  descriptor({ id: 'inpaint', name: 'Inpaint', category: 'Editing', ai: true, capabilities: ['GENERATION', 'MASKING', 'AI'], input: ['image', 'mask'], destructive: true }),
  descriptor({ id: 'try-on', name: 'Try On', category: 'Composition', ai: true, policy: 'CLOUD_ONLY', capabilities: ['GENERATION', 'AI', 'GPU'], input: ['person', 'garment'], identity: true }),
  descriptor({ id: 'generate', name: 'Generate', category: 'Generation', ai: true, policy: 'HYBRID', capabilities: ['GENERATION', 'AI'], input: [], identity: false }),
  descriptor({ id: 'replace-object', name: 'Replace Object', category: 'Editing', ai: true, capabilities: ['GENERATION', 'MASKING', 'AI'], input: ['image', 'mask'], destructive: true }),
  descriptor({ id: 'change-color', name: 'Change Color', category: 'Editing', parameters: { color: { type: 'string', required: true } } }),
  descriptor({ id: 'erase-object', name: 'Erase Object', category: 'Editing', ai: true, capabilities: ['GENERATION', 'MASKING', 'AI'], input: ['image', 'mask'], destructive: true }),
  descriptor({ id: 'face-restore', name: 'Face Restore', category: 'Restoration', ai: true, capabilities: ['AI', 'GPU'], identity: true }),
  descriptor({ id: 'style-transfer', name: 'Style Transfer', category: 'Editing', ai: true, capabilities: ['STYLE', 'AI', 'GPU'], identity: false }),
  descriptor({ id: 'adjust-tone', name: 'Adjust Tone', category: 'Lighting', parameters: { brightness: numberRule(-100, 100), contrast: numberRule(-100, 100) } }),
  descriptor({ id: 'encode', name: 'Encode', category: 'Encoding', parameters: { format: { type: 'string', required: true, values: ['PNG', 'JPEG', 'WEBP'] }, quality: numberRule(1, 100, true) } }),
  descriptor({ id: 'verify-image', name: 'Verify Image', category: 'Verification', input: ['image'], output: ['verification'] }),
  descriptor({ id: 'analyze-image', name: 'Analyze Image', category: 'Analysis', ai: true, capabilities: ['AI'], input: ['image'], output: ['analysis'] }),
]) as readonly OperationDescriptor[];
