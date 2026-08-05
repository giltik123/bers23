import type { CreativeCanvas, CreativeVariant } from './CreativeTypes';

export interface CreativeDebugSnapshot {
  readonly canvas: CreativeCanvas;
  readonly layers: CreativeCanvas['layers'];
  readonly masks: CreativeCanvas['masks'];
  readonly adjustments: CreativeCanvas['adjustments'];
  readonly history: CreativeCanvas['history'];
  readonly variants: readonly CreativeVariant[];
}

export class CreativeDebugger {
  debug(canvas: CreativeCanvas, variants: readonly CreativeVariant[]): CreativeDebugSnapshot {
    return Object.freeze({ canvas, layers: canvas.layers, masks: canvas.masks, adjustments: canvas.adjustments, history: canvas.history, variants: Object.freeze([...variants]) });
  }
}
