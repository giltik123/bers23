import type { CanvasOperation, CanvasOperationType, CreativeCanvas, CreativeCanvasSnapshot } from './CreativeTypes';
import { canvasSnapshot, immutableCreativeSnapshot } from './CreativeSnapshot';

export class CreativeHistory {
  private redoStacks = new Map<string, CanvasOperation[]>();
  private sequence = 0;

  constructor(private readonly clock: () => number = Date.now) {}

  record(canvas: CreativeCanvas, type: CanvasOperationType, before: CreativeCanvasSnapshot, after: CreativeCanvasSnapshot): CanvasOperation {
    this.redoStacks.set(canvas.id, []);
    return Object.freeze({ id: `canvas-operation-${++this.sequence}`, type, before: immutableCreativeSnapshot(before), after: immutableCreativeSnapshot(after), timestamp: this.clock() });
  }

  history(canvas: CreativeCanvas): readonly CanvasOperation[] { return Object.freeze([...canvas.history]); }

  undo(canvas: CreativeCanvas): CreativeCanvas {
    const operation = canvas.history.at(-1);
    if (!operation) return canvas;
    this.redoStacks.set(canvas.id, [...(this.redoStacks.get(canvas.id) || []), operation]);
    return this.restore(canvas, operation.before, canvas.history.slice(0, -1));
  }

  redo(canvas: CreativeCanvas): CreativeCanvas {
    const stack = this.redoStacks.get(canvas.id) || [];
    const operation = stack.at(-1);
    if (!operation) return canvas;
    this.redoStacks.set(canvas.id, stack.slice(0, -1));
    return this.restore(canvas, operation.after, [...canvas.history, operation]);
  }

  private restore(canvas: CreativeCanvas, snapshot: CreativeCanvasSnapshot, history: readonly CanvasOperation[]): CreativeCanvas {
    return Object.freeze({ ...canvas, layers: snapshot.layers, masks: snapshot.masks, adjustments: snapshot.adjustments, selectedLayerId: snapshot.selectedLayerId, status: snapshot.status, history: Object.freeze([...history]), updatedAt: this.clock() });
  }

  snapshot(canvas: CreativeCanvas): CreativeCanvasSnapshot { return canvasSnapshot(canvas); }
}
