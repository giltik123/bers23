import type { ExecutionEdgeCondition } from './ExecutionTypes';

/** Directed relationship between two execution nodes. */
export interface ExecutionEdge {
  readonly from: string;
  readonly to: string;
  readonly condition: ExecutionEdgeCondition;
}

export function createExecutionEdge(from: string, to: string, condition: ExecutionEdgeCondition = 'success'): ExecutionEdge {
  return Object.freeze({ from, to, condition });
}
