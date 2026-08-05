/** States supported by the managed execution state machine. */
export type ExecutionState = 'CREATED' | 'VALIDATING' | 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'RECOVERING';

const transitions: Readonly<Record<ExecutionState, readonly ExecutionState[]>> = Object.freeze({
  CREATED: ['VALIDATING', 'CANCELLED'],
  VALIDATING: ['READY', 'FAILED', 'CANCELLED'],
  READY: ['RUNNING', 'CANCELLED'],
  RUNNING: ['PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED', 'RECOVERING'],
  PAUSED: ['RUNNING', 'CANCELLED', 'RECOVERING'],
  RECOVERING: ['READY', 'RUNNING', 'FAILED', 'CANCELLED'],
  COMPLETED: [], FAILED: ['RECOVERING'], CANCELLED: ['RECOVERING'],
});

/** Strict state machine that rejects invalid lifecycle transitions. */
export class ExecutionStateMachine {
  constructor(private state: ExecutionState = 'CREATED') {}
  get current(): ExecutionState { return this.state; }
  canTransition(next: ExecutionState): boolean { return transitions[this.state].includes(next); }
  transition(next: ExecutionState): ExecutionState {
    if (!this.canTransition(next)) throw new Error(`Invalid execution transition ${this.state} -> ${next}.`);
    this.state = next; return this.state;
  }
}
