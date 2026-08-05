import type { CreativeCanvas } from '../CreativeTypes';
import type { EditCapabilityDecision, LocalAdjustment, LocalOperation, PreviewState, RenderDecision } from './LocalEditingTypes';

export interface LocalEngineDebugSnapshot {
  readonly canvas: CreativeCanvas;
  readonly layers: CreativeCanvas['layers'];
  readonly activePipeline: readonly LocalOperation[];
  readonly appliedAdjustments: readonly LocalAdjustment[];
  readonly previewState: PreviewState;
  readonly renderDecision: RenderDecision | EditCapabilityDecision;
}

export class LocalEngineDebugger {
  debug(input: { canvas: CreativeCanvas; operations: readonly LocalOperation[]; adjustments: readonly LocalAdjustment[]; preview: PreviewState; decision: RenderDecision | EditCapabilityDecision }): LocalEngineDebugSnapshot {
    return Object.freeze({ canvas: input.canvas, layers: input.canvas.layers, activePipeline: Object.freeze([...input.operations]), appliedAdjustments: Object.freeze([...input.adjustments]), previewState: input.preview, renderDecision: input.decision });
  }
}
