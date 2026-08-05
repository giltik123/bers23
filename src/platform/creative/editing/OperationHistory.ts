import type { CreativeOperation } from './CreativeOperation';

export class OperationHistory {
  private operations = new Map<string, CreativeOperation[]>();
  private redoStacks = new Map<string, CreativeOperation[]>();

  record(canvasId: string, operation: CreativeOperation): CreativeOperation {
    this.operations.set(canvasId, [...(this.operations.get(canvasId) || []), operation]);
    this.redoStacks.set(canvasId, []);
    return operation;
  }

  undo(canvasId: string): CreativeOperation | null {
    const list = this.operations.get(canvasId) || [];
    const operation = [...list].reverse().find((candidate) => candidate.status === 'APPLIED');
    if (!operation) return null;
    const reverted = Object.freeze({ ...operation, status: 'REVERTED' as const });
    this.operations.set(canvasId, list.map((candidate) => (candidate.id === operation.id ? reverted : candidate)));
    this.redoStacks.set(canvasId, [...(this.redoStacks.get(canvasId) || []), operation]);
    return reverted;
  }

  redo(canvasId: string): CreativeOperation | null {
    const stack = this.redoStacks.get(canvasId) || [];
    const operation = stack.at(-1);
    if (!operation) return null;
    const applied = Object.freeze({ ...operation, status: 'APPLIED' as const });
    this.redoStacks.set(canvasId, stack.slice(0, -1));
    this.operations.set(canvasId, [...(this.operations.get(canvasId) || []), applied]);
    return applied;
  }

  history(canvasId: string): readonly CreativeOperation[] { return Object.freeze([...(this.operations.get(canvasId) || [])]); }
}
