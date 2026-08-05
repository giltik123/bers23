/** Retry behavior declared by an execution step. */
export interface ExecutionRetryPolicy {
  readonly attempts: number;
  readonly backoffMs: number;
}

/** Serializable schema descriptor; execution adapters decide how to interpret it. */
export type ExecutionSchema = Readonly<Record<string, unknown>>;

/** One provider-neutral unit in an execution plan. */
export interface ExecutionStep {
  readonly id: string;
  readonly name: string;
  readonly capability: string;
  readonly module: string;
  readonly provider?: string;
  readonly dependencies: readonly string[];
  readonly inputSchema?: ExecutionSchema;
  readonly outputSchema?: ExecutionSchema;
  readonly retryPolicy?: ExecutionRetryPolicy;
  readonly timeout?: number;
  readonly riskLevel?: 'low' | 'medium' | 'high';
}

/** Creates an immutable step snapshot for safe graph storage. */
export function freezeExecutionStep(step: ExecutionStep): ExecutionStep {
  return Object.freeze({
    ...step,
    dependencies: Object.freeze([...step.dependencies]),
    inputSchema: step.inputSchema && Object.freeze({ ...step.inputSchema }),
    outputSchema: step.outputSchema && Object.freeze({ ...step.outputSchema }),
    retryPolicy: step.retryPolicy && Object.freeze({ ...step.retryPolicy }),
  });
}
