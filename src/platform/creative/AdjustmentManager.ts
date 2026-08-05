import type { Adjustment, AdjustmentType, CreativeCanvas } from './CreativeTypes';

export class AdjustmentManager {
  private sequence = 0;
  constructor(private readonly clock: () => number = Date.now) {}

  createAdjustment(canvas: CreativeCanvas, input: { id?: string; type: AdjustmentType; value: number; targetLayer: string }): { canvas: CreativeCanvas; adjustment: Adjustment } {
    if (!canvas.layers.some((layer) => layer.id === input.targetLayer)) throw new Error('Adjustment target layer not found');
    const adjustment = Object.freeze({ id: input.id || `creative-adjustment-${++this.sequence}`, type: input.type, value: input.value, targetLayer: input.targetLayer, createdAt: this.clock() });
    return { canvas: Object.freeze({ ...canvas, adjustments: Object.freeze([...canvas.adjustments, adjustment]), status: 'EDITING' }), adjustment };
  }
}
