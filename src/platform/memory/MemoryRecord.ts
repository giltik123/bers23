import type { MemoryCategory, MemoryOwner, MemoryRetention, MemoryVisibility } from './MemoryTypes';

/** Immutable memory observation stored by the Platform memory layer. */
export interface MemoryRecord<Value = unknown> {
  readonly id: string; readonly namespace: string; readonly category: MemoryCategory; readonly owner: MemoryOwner; readonly visibility: MemoryVisibility;
  readonly value: Value; readonly tags: readonly string[]; readonly confidence: number;
  readonly createdAt: string; readonly updatedAt: string; readonly retention: MemoryRetention;
}
export interface MemoryRecordInput<Value = unknown> {
  readonly id?: string; readonly namespace: string; readonly category: MemoryCategory; readonly owner: MemoryOwner; readonly visibility?: MemoryVisibility;
  readonly value: Value; readonly tags?: readonly string[]; readonly confidence?: number; readonly retention?: MemoryRetention;
}
