import { AdjustmentManager } from './AdjustmentManager';
import { CreativeDebugger } from './CreativeDebugger';
import { CreativeHistory } from './CreativeHistory';
import { CreativeLayerManager } from './CreativeLayerManager';
import { canvasSnapshot, immutableCreativeSnapshot } from './CreativeSnapshot';
import { MaskManager } from './MaskManager';
import type { Adjustment, AdjustmentType, CreativeAccessContext, CreativeCanvas, CreativeLayer, CreativeLayerType, CreativeVariant, MaskModel, MaskSource } from './CreativeTypes';

export class CreativeCanvasManager {
  private canvases = new Map<string, CreativeCanvas>();
  private variants = new Map<string, CreativeVariant[]>();
  readonly layers = new CreativeLayerManager();
  readonly masks = new MaskManager();
  readonly history: CreativeHistory;
  readonly adjustments: AdjustmentManager;
  private readonly debuggerApi = new CreativeDebugger();
  private sequence = 0;

  constructor(private readonly clock: () => number = Date.now) {
    this.history = new CreativeHistory(clock);
    this.adjustments = new AdjustmentManager(clock);
  }

  createCreativeCanvas(context: CreativeAccessContext, input: { id?: string; assetId: string; width: number; height: number }): CreativeCanvas {
    const now = this.clock();
    const canvas = Object.freeze({
      id: input.id || `creative-canvas-${++this.sequence}`,
      tenantId: context.tenantId,
      userId: context.userId,
      projectId: context.projectId,
      assetId: input.assetId,
      width: input.width,
      height: input.height,
      layers: Object.freeze([]),
      masks: Object.freeze([]),
      adjustments: Object.freeze([]),
      selectedLayerId: null,
      history: Object.freeze([]),
      status: 'EMPTY',
      createdAt: now,
      updatedAt: now,
    });
    if (this.canvases.has(canvas.id)) throw new Error('Canvas already exists');
    this.canvases.set(canvas.id, canvas);
    this.variants.set(canvas.id, []);
    return canvas;
  }

  getCanvas(context: CreativeAccessContext, canvasId: string): CreativeCanvas {
    const canvas = this.canvases.get(canvasId);
    if (!canvas) throw new Error('Canvas not found');
    this.assertAccess(context, canvas);
    return canvas;
  }

  addLayer(context: CreativeAccessContext, canvasId: string, input: { id?: string; type: CreativeLayerType; name: string; visible?: boolean; opacity?: number; order?: number; locked?: boolean; metadata?: Record<string, unknown> }): CreativeLayer {
    const canvas = this.getCanvas(context, canvasId);
    const before = canvasSnapshot(canvas);
    const result = this.layers.addLayer(canvas, input);
    this.saveWithOperation(context, result.canvas, 'LAYER_ADDED', before);
    return result.layer;
  }

  removeLayer(context: CreativeAccessContext, canvasId: string, layerId: string): CreativeCanvas {
    const canvas = this.getCanvas(context, canvasId);
    const before = canvasSnapshot(canvas);
    const updated = this.layers.removeLayer(canvas, layerId);
    return this.saveWithOperation(context, updated, 'LAYER_REMOVED', before);
  }

  reorderLayer(context: CreativeAccessContext, canvasId: string, layerId: string, order: number): CreativeCanvas {
    const canvas = this.getCanvas(context, canvasId);
    const before = canvasSnapshot(canvas);
    const updated = this.layers.reorderLayer(canvas, layerId, order);
    return this.saveWithOperation(context, updated, 'LAYER_ADDED', before);
  }

  createMask(context: CreativeAccessContext, canvasId: string, input: { id?: string; assetId: string; layerId: string; region: unknown; source: MaskSource; confidence: number }): MaskModel {
    const canvas = this.getCanvas(context, canvasId);
    const before = canvasSnapshot(canvas);
    const result = this.masks.createMask(canvas, input);
    this.saveWithOperation(context, result.canvas, 'MASK_CHANGED', before);
    return result.mask;
  }

  createAdjustment(context: CreativeAccessContext, canvasId: string, input: { id?: string; type: AdjustmentType; value: number; targetLayer: string }): Adjustment {
    const canvas = this.getCanvas(context, canvasId);
    const before = canvasSnapshot(canvas);
    const result = this.adjustments.createAdjustment(canvas, input);
    this.saveWithOperation(context, result.canvas, 'ADJUSTMENT_CHANGED', before);
    return result.adjustment;
  }

  addAiResultLayer(context: CreativeAccessContext, canvasId: string, input: { id?: string; name: string; metadata?: Record<string, unknown> }): CreativeLayer {
    const canvas = this.getCanvas(context, canvasId);
    const before = canvasSnapshot(canvas);
    const result = this.layers.addLayer(canvas, { ...input, type: 'AI_RESULT' });
    this.saveWithOperation(context, Object.freeze({ ...result.canvas, status: 'COMPLETED' }), 'AI_RESULT_ADDED', before);
    return result.layer;
  }

  undo(context: CreativeAccessContext, canvasId: string): CreativeCanvas {
    const canvas = this.getCanvas(context, canvasId);
    const updated = this.history.undo(canvas);
    this.canvases.set(canvasId, updated);
    return updated;
  }

  redo(context: CreativeAccessContext, canvasId: string): CreativeCanvas {
    const canvas = this.getCanvas(context, canvasId);
    const updated = this.history.redo(canvas);
    this.canvases.set(canvasId, updated);
    return updated;
  }

  createVariant(context: CreativeAccessContext, canvasId: string, input: { id?: string; name: string; parentVariantId?: string | null }): CreativeVariant {
    const canvas = this.getCanvas(context, canvasId);
    const variant = Object.freeze({ id: input.id || `creative-variant-${++this.sequence}`, canvasId, name: input.name, parentVariantId: input.parentVariantId ?? null, changes: Object.freeze([...canvas.history]), createdAt: this.clock() });
    this.variants.set(canvasId, [...this.getVariants(context, canvasId), variant]);
    return variant;
  }

  getVariants(context: CreativeAccessContext, canvasId: string): readonly CreativeVariant[] {
    this.getCanvas(context, canvasId);
    return Object.freeze([...(this.variants.get(canvasId) || [])]);
  }

  historyFor(context: CreativeAccessContext, canvasId: string) { return this.history.history(this.getCanvas(context, canvasId)); }

  debug(context: CreativeAccessContext, canvasId: string) { return this.debuggerApi.debug(this.getCanvas(context, canvasId), this.getVariants(context, canvasId)); }

  private saveWithOperation(context: CreativeAccessContext, canvas: CreativeCanvas, type: Parameters<CreativeHistory['record']>[1], before: ReturnType<typeof canvasSnapshot>): CreativeCanvas {
    this.assertAccess(context, canvas);
    const withoutHistory = Object.freeze({ ...canvas, updatedAt: this.clock() });
    const operation = this.history.record(withoutHistory, type, before, canvasSnapshot(withoutHistory));
    const updated = Object.freeze({ ...withoutHistory, history: Object.freeze([...withoutHistory.history, operation]), status: withoutHistory.status === 'EMPTY' ? 'READY' : withoutHistory.status });
    this.canvases.set(updated.id, updated);
    return updated;
  }

  private assertAccess(context: CreativeAccessContext, canvas: CreativeCanvas): void {
    if (canvas.tenantId !== context.tenantId) throw new Error('Tenant access denied');
    if (canvas.projectId !== context.projectId) throw new Error('Project access denied');
    if (canvas.userId !== context.userId) throw new Error('User access denied');
  }
}

export function createCreativeCanvas(context: CreativeAccessContext, input: { id?: string; assetId: string; width: number; height: number }): CreativeCanvas {
  return new CreativeCanvasManager().createCreativeCanvas(context, input);
}
