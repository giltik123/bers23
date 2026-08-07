import { pipelineDeepFreeze } from './PipelineImmutable';
import type { PipelineOperationDefinition } from './ImagePipelineTypes';

const defaults: readonly Omit<PipelineOperationDefinition, 'id'>[] = [
  { workflowOperation: 'lighting.normalize', implementation: 'color balance', capability: 'local', aliases: ['lighting'], versions: ['1.0.0'], deprecated: false, fallback: 'brightness', priority: 100, effects: { estimatedQuality: 0.9 }, resources: { cpu: 2, gpu: 0, ram: 8, latency: 2, credits: 0 } },
  { workflowOperation: 'color.white_balance', implementation: 'color balance', capability: 'local', aliases: ['white balance'], versions: ['1.0.0'], deprecated: false, fallback: 'brightness', priority: 95, effects: { estimatedQuality: 0.9 }, resources: { cpu: 2, gpu: 0, ram: 8, latency: 2, credits: 0 } },
  { workflowOperation: 'tone.contrast.adjust', implementation: 'contrast', capability: 'local', aliases: ['contrast'], versions: ['1.0.0'], deprecated: false, priority: 90, effects: { estimatedQuality: 0.88 }, resources: { cpu: 1, gpu: 0, ram: 4, latency: 1, credits: 0 } },
  { workflowOperation: 'pipeline.upscale.real_esrgan', implementation: 'upscale', capability: 'gpu', aliases: ['upscale'], versions: ['1.0.0', '2.0.0'], deprecated: false, fallback: 'resize', priority: 100, effects: {}, resources: { cpu: 1, gpu: 8, ram: 32, latency: 5, credits: 0 } },
  { workflowOperation: 'pipeline.background.remove', implementation: 'background removal', capability: 'ai', aliases: ['remove background'], versions: ['1.0.0'], deprecated: false, fallback: 'segmentation', priority: 100, effects: { alpha: true, channels: 4 }, resources: { cpu: 1, gpu: 2, ram: 16, latency: 5, credits: 10 } },
  { workflowOperation: 'pipeline.segment.subject', implementation: 'segmentation', capability: 'hybrid', aliases: ['segmentation'], versions: ['1.0.0'], deprecated: false, fallback: 'mask merge', priority: 90, effects: { alpha: true }, resources: { cpu: 2, gpu: 4, ram: 16, latency: 4, credits: 0 } },
  { workflowOperation: 'portrait.skin.preserve', implementation: 'skin preservation', capability: 'hybrid', aliases: ['skin'], versions: ['1.0.0'], deprecated: false, fallback: 'blur', priority: 80, effects: { estimatedQuality: 0.92 }, resources: { cpu: 2, gpu: 3, ram: 12, latency: 3, credits: 0 } },
  { workflowOperation: 'fashion.try_on', implementation: 'virtual try-on', capability: 'ai', aliases: ['try-on'], versions: ['1.0.0'], deprecated: false, priority: 100, effects: {}, resources: { cpu: 1, gpu: 2, ram: 24, latency: 8, credits: 20 } },
  { workflowOperation: 'pipeline.export', implementation: 'png encode', capability: 'local', aliases: ['export'], versions: ['1.0.0'], deprecated: false, fallback: 'jpeg encode', priority: 100, effects: { format: 'png' }, resources: { cpu: 1, gpu: 0, ram: 4, latency: 1, credits: 0 } },
];

export class PipelineOperationRegistry {
  private readonly definitions: PipelineOperationDefinition[] = [];
  constructor(private readonly id: () => string, entries: readonly Omit<PipelineOperationDefinition, 'id'>[] = defaults) { entries.forEach((entry) => this.register(entry)); }

  register(input: Omit<PipelineOperationDefinition, 'id'> & Partial<Pick<PipelineOperationDefinition, 'id'>>): PipelineOperationDefinition {
    const value = pipelineDeepFreeze({ ...input, id: input.id ?? this.id(), aliases: [...new Set(input.aliases)].sort(), versions: [...new Set(input.versions)].sort(), effects: { ...input.effects }, resources: { ...input.resources } }) as PipelineOperationDefinition;
    if (this.definitions.some((item) => item.id === value.id)) throw new Error(`Duplicate pipeline operation id: ${value.id}`);
    this.definitions.push(value);
    return value;
  }

  resolve(operation: string, version?: string): PipelineOperationDefinition | undefined {
    const term = operation.trim().toLowerCase();
    return this.definitions.filter((item) => !item.deprecated && (!version || item.versions.includes(version)) && (item.workflowOperation.toLowerCase() === term || item.aliases.some((alias) => alias.toLowerCase() === term))).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0];
  }
  fallback(operation: string): string | undefined { return this.resolve(operation)?.fallback; }
  all(): readonly PipelineOperationDefinition[] { return pipelineDeepFreeze(this.definitions.slice().sort((a, b) => a.workflowOperation.localeCompare(b.workflowOperation) || b.priority - a.priority)); }
}
