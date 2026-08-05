import type { CreativeCanvas } from '../CreativeTypes';
import { immutableLocalSnapshot } from './LocalImmutable';
import { LayerRenderer } from './LayerRenderer';
import type { LocalAdjustment, PreviewState } from './LocalEditingTypes';

export class LocalPreviewEngine {
  private sequence = 0;
  constructor(private readonly renderer = new LayerRenderer(), private readonly clock: () => number = Date.now) {}

  generatePreview(canvas: CreativeCanvas, adjustments: readonly LocalAdjustment[]): PreviewState {
    const decision = this.renderer.render(canvas, adjustments);
    return Object.freeze({ id: `local-preview-${++this.sequence}`, canvasId: canvas.id, layers: decision.layers, adjustments: immutableLocalSnapshot(adjustments), renderHash: this.hash(decision), generatedAt: this.clock(), assetCreated: false });
  }

  private hash(value: unknown): string { return JSON.stringify(value).split('').reduce((hash, char) => `${((Number(hash) * 31) + char.charCodeAt(0)) >>> 0}`, '7'); }
}
