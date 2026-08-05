import type { CreativeCanvas } from '../CreativeTypes';
import { immutableLocalSnapshot } from './LocalImmutable';
import { LocalPreviewEngine } from './LocalPreviewEngine';
import type { LocalAdjustment, LocalOperation, PreviewState } from './LocalEditingTypes';

export class AdjustmentPipeline {
  private operations = new Map<string, LocalOperation[]>();
  private redoStacks = new Map<string, LocalOperation[]>();
  private sequence = 0;

  constructor(private readonly previewEngine: LocalPreviewEngine, private readonly clock: () => number = Date.now) {}

  apply(canvas: CreativeCanvas, adjustment: LocalAdjustment): LocalOperation {
    const current = this.previewEngine.generatePreview(canvas, this.activeAdjustments(canvas.id));
    const normalized = Object.freeze({ ...adjustment, id: adjustment.id || `local-adjustment-${++this.sequence}`, metadata: immutableLocalSnapshot(adjustment.metadata || {}) });
    const after = this.previewEngine.generatePreview(canvas, [...this.activeAdjustments(canvas.id), normalized]);
    const operation = Object.freeze({ id: `local-operation-${++this.sequence}`, canvasId: canvas.id, tenantId: canvas.tenantId, projectId: canvas.projectId, userId: canvas.userId, adjustment: normalized, status: 'APPLIED' as const, before: current, after, timestamp: this.clock() });
    this.operations.set(canvas.id, [...(this.operations.get(canvas.id) || []), operation]);
    this.redoStacks.set(canvas.id, []);
    return operation;
  }

  remove(canvas: CreativeCanvas, operationId: string): LocalOperation {
    const list = this.operations.get(canvas.id) || [];
    const index = list.findIndex((operation) => operation.id === operationId && operation.status === 'APPLIED');
    if (index === -1) throw new Error('Local operation not found');
    const reverted = Object.freeze({ ...list[index], status: 'REVERTED' as const, timestamp: this.clock() });
    const next = list.map((operation, currentIndex) => (currentIndex === index ? reverted : operation));
    this.operations.set(canvas.id, next);
    this.redoStacks.set(canvas.id, [...(this.redoStacks.get(canvas.id) || []), list[index]]);
    return reverted;
  }

  redo(canvas: CreativeCanvas): LocalOperation | null {
    const stack = this.redoStacks.get(canvas.id) || [];
    const operation = stack.at(-1);
    if (!operation) return null;
    this.redoStacks.set(canvas.id, stack.slice(0, -1));
    const restored = Object.freeze({ ...operation, status: 'APPLIED' as const, timestamp: this.clock() });
    this.operations.set(canvas.id, [...(this.operations.get(canvas.id) || []), restored]);
    return restored;
  }

  history(canvasId: string): readonly LocalOperation[] { return Object.freeze([...(this.operations.get(canvasId) || [])]); }
  activeAdjustments(canvasId: string): readonly LocalAdjustment[] { return Object.freeze((this.operations.get(canvasId) || []).filter((operation) => operation.status === 'APPLIED').map((operation) => operation.adjustment)); }
  preview(canvas: CreativeCanvas): PreviewState { return this.previewEngine.generatePreview(canvas, this.activeAdjustments(canvas.id)); }
}
