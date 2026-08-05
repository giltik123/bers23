import { ExecutionGraph } from './ExecutionGraph';
import { ExecutionHistory } from './ExecutionHistory';
import { ExecutionPlanner } from './ExecutionPlanner';
import { ExecutionValidator, type ExecutionProviderAvailability } from './ExecutionValidator';

/** Independent services used to plan and track future execution. */
export interface ExecutionRuntime {
  readonly planner: ExecutionPlanner;
  readonly validator: ExecutionValidator;
  readonly history: ExecutionHistory;
  /** Creates an isolated graph for custom or executor-defined plans. */
  readonly graph: () => ExecutionGraph;
}

/** Creates an isolated execution runtime without starting any business engine. */
export function createExecutionRuntime(providerAvailable?: ExecutionProviderAvailability): ExecutionRuntime {
  const history = new ExecutionHistory();
  return Object.freeze({
    planner: new ExecutionPlanner(undefined, history),
    validator: new ExecutionValidator(providerAvailable),
    history,
    graph: () => new ExecutionGraph(),
  });
}
