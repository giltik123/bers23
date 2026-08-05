import type { ExecutionStep } from './ExecutionStep';
import type { ExecutionNodeStatus, ExecutionNodeType } from './ExecutionTypes';

/** Planning representation of one AI operation in an execution graph. */
export interface ExecutionNode extends ExecutionStep {
  readonly type: ExecutionNodeType;
  readonly status: ExecutionNodeStatus;
}

/** Converts a compatible step into an immutable graph node. */
export function createExecutionNode(step: ExecutionStep, type: ExecutionNodeType, status: ExecutionNodeStatus = 'pending'): ExecutionNode {
  return Object.freeze({ ...step, dependencies: Object.freeze([...step.dependencies]), type, status });
}
