import { ExecutionGraph } from '../ExecutionGraph';
import type { ExecutionPlan } from '../ExecutionPlan';
import { ExecutionValidator } from '../ExecutionValidator';
import { ExecutionEventEmitter } from './ExecutionEventEmitter';
import type { ExecutionResult, StepExecutionState } from './ExecutionResult';
import { ExecutionCancellation, ExecutionRunner } from './ExecutionRunner';
import type { StepExecutor } from './StepExecutor';

/** Read-only runtime inventory for debugging and administration. */
export interface ExecutionRuntimeInspection {
  readonly currentExecutions: readonly string[];
  readonly activeSteps: readonly { readonly executionId: string; readonly stepId: string }[];
  readonly completedExecutions: readonly string[];
  readonly failures: readonly { readonly executionId: string; readonly error?: string }[];
}

interface ActiveExecution { readonly cancellation: ExecutionCancellation; readonly planId: string; activeStep?: string; }

/** Facade that validates, runs, cancels, and inspects execution plans. */
export class ExecutionRuntime {
  readonly events: ExecutionEventEmitter;
  private readonly runner: ExecutionRunner;
  private readonly active = new Map<string, ActiveExecution>();
  private readonly results = new Map<string, ExecutionResult>();
  private sequence = 0;

  constructor(private readonly executor: StepExecutor, private readonly validator = new ExecutionValidator(), events = new ExecutionEventEmitter()) {
    this.events = events;
    this.runner = new ExecutionRunner(executor, events);
    this.events.on('execution.step.started', ({ executionId, step }) => { const active = this.active.get(executionId); if (active) active.activeStep = step.stepId; });
    const clearStep = ({ executionId }: { readonly executionId: string; readonly step: StepExecutionState }): void => { const active = this.active.get(executionId); if (active) active.activeStep = undefined; };
    this.events.on('execution.step.completed', clearStep);
    this.events.on('execution.step.failed', clearStep);
  }

  /** Validates and starts an immutable plan, resolving with its terminal result. */
  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    const graphValidation = validateGraph(plan);
    if (!graphValidation.valid) throw new Error(`Invalid execution graph: ${graphValidation.errors.join(' ')}`);
    const validation = await this.validator.validate(plan);
    if (!validation.valid) throw new Error(`Invalid execution plan: ${validation.errors.join(' ')}`);
    const executionId = `${plan.id}-${++this.sequence}`;
    const cancellation = new ExecutionCancellation();
    this.active.set(executionId, { cancellation, planId: plan.id });
    try {
      const result = await this.runner.run(executionId, plan, cancellation);
      this.results.set(executionId, result);
      return result;
    } finally {
      this.active.delete(executionId);
    }
  }

  /** Requests cooperative cancellation of a current execution. */
  cancel(executionId: string): boolean {
    const execution = this.active.get(executionId);
    if (!execution) return false;
    execution.cancellation.cancel();
    return true;
  }

  /** Returns immutable current and terminal runtime state. */
  inspect(): ExecutionRuntimeInspection {
    return Object.freeze({
      currentExecutions: Object.freeze([...this.active.keys()]),
      activeSteps: Object.freeze([...this.active].flatMap(([executionId, execution]) => execution.activeStep ? [Object.freeze({ executionId, stepId: execution.activeStep })] : [])),
      completedExecutions: Object.freeze([...this.results].filter(([, result]) => result.status === 'completed').map(([id]) => id)),
      failures: Object.freeze([...this.results].filter(([, result]) => result.status === 'failed').map(([executionId, result]) => Object.freeze({ executionId, error: result.error }))),
    });
  }
}

function validateGraph(plan: ExecutionPlan): ReturnType<ExecutionGraph['validate']> {
  const graph = new ExecutionGraph();
  for (const step of plan.steps) graph.addStep(step);
  const validation = graph.validate();
  if (validation.valid) {
    const actualOrder = graph.getExecutionOrder();
    if (actualOrder.length !== plan.executionOrder.length || actualOrder.some((id, index) => id !== plan.executionOrder[index])) {
      return Object.freeze({ valid: false, errors: Object.freeze(['Plan executionOrder does not match its dependency graph.']) });
    }
  }
  return validation;
}
