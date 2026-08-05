import { ExecutionContext } from '../execution/ExecutionContext';
import type { ExecutionNode } from '../execution/ExecutionNode';
import type { StepResult } from '../execution/runtime/StepExecutor';
import { ExecutionCancellation, ExecutionCancelledError } from './ExecutionCancellation';
import { ExecutionEvents } from './ExecutionEvents';

/** Adapter boundary implemented later by Jobs/Pipeline integrations. */
export interface ExecutionWorkerAdapter { execute(node: ExecutionNode, context: ExecutionContext, cancellation: ExecutionCancellation): Promise<StepResult>; }
export interface ExecutionWorkerOptions { readonly maxRetries?: number; readonly retryDelayMs?: number; readonly defaultTimeoutMs?: number; }
export interface ExecutionWorkerResult { readonly result: StepResult; readonly attempts: number; }

/** Executes one node with bounded retry, timeout, cancellation, and isolated attempts. */
export class ExecutionWorker {
  private readonly maxRetries: number; private readonly retryDelayMs: number; private readonly defaultTimeoutMs: number;
  constructor(private readonly adapter: ExecutionWorkerAdapter, private readonly events: ExecutionEvents, options: ExecutionWorkerOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3; this.retryDelayMs = options.retryDelayMs ?? 100; this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000;
  }
  async run(executionId: string, node: ExecutionNode, sharedContext: ExecutionContext, cancellation: ExecutionCancellation): Promise<ExecutionWorkerResult> {
    const configuredAttempts = node.retryPolicy?.attempts;
    const maxAttempts = configuredAttempts ?? this.maxRetries + 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      cancellation.throwIfCancelled();
      await this.events.emit('execution.step.started', Object.freeze({ executionId, stepId: node.id, attempt }));
      const attemptContext = cloneContext(sharedContext);
      try {
        const result = await raceExecution(this.adapter.execute(node, attemptContext, cancellation), node.timeout ?? this.defaultTimeoutMs, cancellation, node.id);
        mergeContext(attemptContext, sharedContext);
        await this.events.emit('execution.step.completed', Object.freeze({ executionId, stepId: node.id, attempt }));
        return Object.freeze({ result: Object.freeze({ ...result, metadata: result.metadata && Object.freeze({ ...result.metadata }) }), attempts: attempt });
      } catch (error) {
        if (error instanceof ExecutionCancelledError) throw error;
        lastError = error;
        if (attempt < maxAttempts) await cancellableDelay(this.retryDelayMs * attempt, cancellation);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

function cloneContext(source: ExecutionContext): ExecutionContext { const target = new ExecutionContext(); for (const [key, value] of Object.entries(source.snapshot())) target.set(key, value); return target; }
function mergeContext(source: ExecutionContext, target: ExecutionContext): void { for (const [key, value] of Object.entries(source.snapshot())) target.set(key, value); }
async function raceExecution(execution: Promise<StepResult>, timeoutMs: number, cancellation: ExecutionCancellation, stepId: string): Promise<StepResult> {
  let timer: ReturnType<typeof setTimeout> | undefined; let unsubscribe = () => undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Step "${stepId}" timed out after ${timeoutMs}ms.`)), timeoutMs); });
  const cancelled = new Promise<never>((_, reject) => { unsubscribe = cancellation.onCancel(() => reject(new ExecutionCancelledError())); });
  try { return await Promise.race([execution, timeout, cancelled]); } finally { if (timer) clearTimeout(timer); unsubscribe(); void execution.catch(() => undefined); }
}
async function cancellableDelay(duration: number, cancellation: ExecutionCancellation): Promise<void> {
  await new Promise<void>((resolve, reject) => { let unsubscribe = () => undefined; const timer = setTimeout(() => { unsubscribe(); resolve(); }, duration); unsubscribe = cancellation.onCancel(() => { clearTimeout(timer); reject(new ExecutionCancelledError()); }); });
}
