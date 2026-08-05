import type { CreativeAccessContext, CreativeLayer } from '../CreativeTypes';
import { AdjustmentPipeline } from './AdjustmentPipeline';
import { EditCapabilityResolver } from './EditCapabilityResolver';
import { LayerRenderer } from './LayerRenderer';
import { LocalEngineDebugger } from './LocalEngineDebugger';
import { LocalPreviewEngine } from './LocalPreviewEngine';
import type { CanvasPort, EditCapabilityDecision, HistoryPort, LocalAdjustment, LocalEditingResult, LocalOperation, PreviewState } from './LocalEditingTypes';

export class LocalEditingEngine {
  private readonly previewEngine: LocalPreviewEngine;
  private readonly pipeline: AdjustmentPipeline;
  private readonly renderer = new LayerRenderer();
  private readonly resolver = new EditCapabilityResolver();
  private readonly debuggerApi = new LocalEngineDebugger();

  constructor(private readonly canvasPort: CanvasPort, private readonly historyPort: HistoryPort, private readonly clock: () => number = Date.now) {
    this.previewEngine = new LocalPreviewEngine(this.renderer, clock);
    this.pipeline = new AdjustmentPipeline(this.previewEngine, clock);
  }

  apply(input: { context: CreativeAccessContext; canvasId: string; adjustment: LocalAdjustment }): LocalEditingResult {
    const canvas = this.canvasPort.getCanvas(input.context, input.canvasId);
    this.assertAccess(input.context, canvas);
    const decision = this.resolver.resolve({ operation: input.adjustment.type });
    if (decision.mode !== 'LOCAL') throw new Error('Operation requires AI rendering');
    const operation = this.pipeline.apply(canvas, input.adjustment);
    this.record('operation.started', input.canvasId, operation.id, { adjustment: input.adjustment });
    this.record('operation.completed', input.canvasId, operation.id, operation);
    return Object.freeze({ success: true, operationId: operation.id, updatedLayer: this.findUpdatedLayer(canvas.layers, input.adjustment.targetLayer), previewAvailable: true, preview: operation.after, credits: 0 });
  }

  preview(input: { context: CreativeAccessContext; canvasId: string }): PreviewState {
    const canvas = this.canvasPort.getCanvas(input.context, input.canvasId);
    this.assertAccess(input.context, canvas);
    return this.pipeline.preview(canvas);
  }

  remove(input: { context: CreativeAccessContext; canvasId: string; operationId: string }): LocalOperation {
    const canvas = this.canvasPort.getCanvas(input.context, input.canvasId);
    this.assertAccess(input.context, canvas);
    const reverted = this.pipeline.remove(canvas, input.operationId);
    this.record('operation.reverted', input.canvasId, input.operationId, reverted);
    return reverted;
  }

  redo(input: { context: CreativeAccessContext; canvasId: string }): LocalOperation | null {
    const canvas = this.canvasPort.getCanvas(input.context, input.canvasId);
    this.assertAccess(input.context, canvas);
    const operation = this.pipeline.redo(canvas);
    if (operation) this.record('operation.completed', input.canvasId, operation.id, operation);
    return operation;
  }

  history(input: { context: CreativeAccessContext; canvasId: string }): readonly LocalOperation[] {
    const canvas = this.canvasPort.getCanvas(input.context, input.canvasId);
    this.assertAccess(input.context, canvas);
    return this.pipeline.history(input.canvasId);
  }

  inspect(input: { context: CreativeAccessContext; canvasId: string }) {
    const canvas = this.canvasPort.getCanvas(input.context, input.canvasId);
    this.assertAccess(input.context, canvas);
    const adjustments = this.pipeline.activeAdjustments(input.canvasId);
    const preview = this.pipeline.preview(canvas);
    return Object.freeze({ canvas, activePipeline: this.pipeline.history(input.canvasId), appliedAdjustments: adjustments, previewState: preview, renderDecision: this.renderer.render(canvas, adjustments) });
  }

  debug(input: { context: CreativeAccessContext; canvasId: string }) {
    const inspection = this.inspect(input);
    return this.debuggerApi.debug({ canvas: inspection.canvas, operations: inspection.activePipeline, adjustments: inspection.appliedAdjustments, preview: inspection.previewState, decision: inspection.renderDecision });
  }

  resolve(input: { operation?: LocalAdjustment['type']; prompt?: string }): EditCapabilityDecision { return this.resolver.resolve(input); }

  private record(type: Parameters<HistoryPort['record']>[0]['type'], canvasId: string, operationId: string, snapshot: unknown): void {
    this.historyPort.record({ type, canvasId, operationId, snapshot, timestamp: this.clock() });
  }

  private assertAccess(context: CreativeAccessContext, canvas: { readonly tenantId: string; readonly projectId: string; readonly userId: string }): void {
    if (canvas.tenantId !== context.tenantId) throw new Error('Tenant access denied');
    if (canvas.projectId !== context.projectId) throw new Error('Project access denied');
    if (canvas.userId !== context.userId) throw new Error('User access denied');
  }

  private findUpdatedLayer(layers: readonly CreativeLayer[], targetLayer?: string): CreativeLayer | null { return targetLayer ? layers.find((layer) => layer.id === targetLayer) || null : null; }
}
