import type { ExecutionStep } from './ExecutionStep';
import type { ExecutionNode } from './ExecutionNode';
import type { ExecutionEdge } from './ExecutionEdge';

/** Immutable plan produced from one versioned routing decision. */
export interface ExecutionPlan {
  readonly id: string;
  readonly routeId: string;
  readonly version: string;
  readonly status: 'ready' | 'rejected';
  readonly nodes: readonly ExecutionNode[];
  readonly edges: readonly ExecutionEdge[];
  readonly steps: readonly ExecutionStep[];
  readonly executionOrder: readonly string[];
  readonly estimatedCost: number;
  /** Estimated wall-clock duration in seconds. */
  readonly estimatedDuration: number;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly createdAt: string;
}
