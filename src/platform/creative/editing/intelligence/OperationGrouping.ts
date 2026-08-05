import type { CreativeOperationGroup, EditOperation } from './types';

export class OperationGrouping {
  group(operations: EditOperation[], name = 'Natural Photo Enhancement'): CreativeOperationGroup[] {
    const localTypes = new Set<EditOperation['type']>(['brightness', 'contrast', 'color', 'lighting', 'sharpness']);
    const local = operations.filter((operation) => operation.mode === 'LOCAL' && localTypes.has(operation.type));
    const rest = operations.filter((operation) => !local.includes(operation));
    const groups: CreativeOperationGroup[] = [];
    if (local.length > 0) groups.push({ name, operations: local, undoLabel: `Undo ${name}`, credits: 0 });
    for (const operation of rest) groups.push({ name: operation.label, operations: [operation], undoLabel: `Undo ${operation.label}`, credits: operation.credits });
    return groups;
  }
}
