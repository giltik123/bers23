import { deepFreeze } from './immutable';
import type { OperationMapping } from './types';

const normalize = (value: string): string => value.trim().toLocaleLowerCase('en-US');

const defaults: readonly OperationMapping[] = [
  { operation: 'background removal', capability: 'background.removal', workflowStep: 'pipeline.background.remove', aliases: ['remove background', 'background cleanup'], parameters: {} },
  { operation: 'upscale', capability: 'image.upscale', workflowStep: 'pipeline.upscale.real_esrgan', aliases: ['super resolution'], parameters: { scale: 2 } },
  { operation: 'lighting', capability: 'lighting.adjustment', workflowStep: 'lighting.normalize', aliases: ['soft lighting', 'dramatic lighting', 'exposure'], parameters: {} },
  { operation: 'white balance', capability: 'color.balance', workflowStep: 'color.white_balance', aliases: ['temperature'], parameters: {} },
  { operation: 'contrast', capability: 'tone.contrast', workflowStep: 'tone.contrast.adjust', aliases: ['low contrast'], parameters: {} },
  { operation: 'segmentation', capability: 'image.segmentation', workflowStep: 'pipeline.segment.subject', aliases: ['subject mask', 'body segmentation'], parameters: {} },
  { operation: 'skin retouch', capability: 'portrait.skin', workflowStep: 'portrait.skin.preserve', aliases: ['skin', 'skin preservation'], parameters: {} },
  { operation: 'virtual try-on', capability: 'fashion.try_on', workflowStep: 'fashion.try_on', aliases: ['try-on'], parameters: {} },
  { operation: 'export', capability: 'image.export', workflowStep: 'pipeline.export', aliases: ['save'], parameters: { format: 'png' } },
];

export class OperationRegistry {
  private mappings = new Map<string, OperationMapping>();

  constructor(entries: readonly OperationMapping[] = defaults) {
    entries.forEach((entry) => this.register(entry));
  }

  register(mapping: OperationMapping): OperationMapping {
    const value = deepFreeze({ ...mapping, aliases: [...new Set(mapping.aliases)].sort(), parameters: { ...mapping.parameters } }) as OperationMapping;
    for (const key of [mapping.operation, ...mapping.aliases]) {
      const normalized = normalize(key);
      if (this.mappings.has(normalized)) throw new Error(`Duplicate operation mapping: ${key}`);
      this.mappings.set(normalized, value);
    }
    return value;
  }

  resolve(operation: string): OperationMapping | undefined {
    const normalized = normalize(operation);
    const exact = this.mappings.get(normalized);
    if (exact) return exact;
    const candidates = this.all().filter((entry) => normalized.includes(normalize(entry.operation)) || entry.aliases.some((alias) => normalized.includes(normalize(alias))));
    return candidates.sort((a, b) => b.operation.length - a.operation.length || a.operation.localeCompare(b.operation))[0];
  }

  capability(operation: string): string | undefined { return this.resolve(operation)?.capability; }
  workflowStep(operation: string): string | undefined { return this.resolve(operation)?.workflowStep; }
  all(): readonly OperationMapping[] { return deepFreeze([...new Set(this.mappings.values())].sort((a, b) => a.operation.localeCompare(b.operation))); }
}
