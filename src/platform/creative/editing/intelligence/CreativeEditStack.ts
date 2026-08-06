import type { CreativeEditStack as CreativeEditStackState, EditOperation } from './types';

export class CreativeEditStack {
  create(baseAsset: string): CreativeEditStackState {
    return { baseAsset, operations: [], currentVersion: `${baseAsset}:v0` };
  }

  apply(stack: CreativeEditStackState, operation: EditOperation): CreativeEditStackState {
    const operations = [...stack.operations, operation];
    return { baseAsset: stack.baseAsset, operations, currentVersion: `${stack.baseAsset}:v${operations.length}` };
  }

  undo(stack: CreativeEditStackState): CreativeEditStackState {
    const operations = stack.operations.slice(0, -1);
    return { baseAsset: stack.baseAsset, operations, currentVersion: `${stack.baseAsset}:v${operations.length}` };
  }
}
