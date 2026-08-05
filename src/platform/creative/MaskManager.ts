import type { CreativeCanvas, MaskModel, MaskSource } from './CreativeTypes';
import { immutableCreativeSnapshot } from './CreativeSnapshot';

export class MaskManager {
  private sequence = 0;

  createMask(canvas: CreativeCanvas, input: { id?: string; assetId: string; layerId: string; region: unknown; source: MaskSource; confidence: number }): { canvas: CreativeCanvas; mask: MaskModel } {
    if (input.assetId !== canvas.assetId) throw new Error('Mask asset does not belong to canvas');
    if (!canvas.layers.some((layer) => layer.id === input.layerId)) throw new Error('Mask layer not found');
    const mask = Object.freeze({ id: input.id || `creative-mask-${++this.sequence}`, assetId: input.assetId, layerId: input.layerId, region: immutableCreativeSnapshot(input.region), source: input.source, confidence: input.confidence });
    return { canvas: Object.freeze({ ...canvas, masks: Object.freeze([...canvas.masks, mask]), status: 'EDITING' }), mask };
  }
}
