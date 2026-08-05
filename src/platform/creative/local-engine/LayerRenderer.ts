import type { CreativeCanvas } from '../CreativeTypes';
import type { LocalAdjustment, RenderDecision } from './LocalEditingTypes';

export class LayerRenderer {
  render(canvas: CreativeCanvas, adjustments: readonly LocalAdjustment[]): RenderDecision {
    return Object.freeze({ canvasId: canvas.id, layers: Object.freeze(canvas.layers.map((layer) => layer.id)), masks: Object.freeze(canvas.masks.map((mask) => mask.id)), adjustments: Object.freeze([...adjustments]), effects: Object.freeze(canvas.layers.filter((layer) => layer.type === 'EFFECT').map((layer) => layer.id)), output: 'PREVIEW' });
  }
}
