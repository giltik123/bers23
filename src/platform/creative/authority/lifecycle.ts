import { immutable } from '../operations/contracts';

export type OperationLifecycleState = 'CREATED' | 'VALIDATED' | 'ESTIMATED' | 'AUTHORIZED' | 'RESERVED' | 'DISPATCHED' | 'RUNNING' | 'VERIFYING' | 'COMMITTED' | 'REJECTED' | 'CANCELLED' | 'FAILED' | 'RELEASED' | 'UNKNOWN';
const transitions: Readonly<Record<OperationLifecycleState, readonly OperationLifecycleState[]>> = immutable({
  CREATED: ['VALIDATED', 'REJECTED', 'CANCELLED'], VALIDATED: ['ESTIMATED', 'REJECTED', 'CANCELLED'], ESTIMATED: ['AUTHORIZED', 'REJECTED', 'CANCELLED'],
  AUTHORIZED: ['RESERVED', 'DISPATCHED', 'CANCELLED'], RESERVED: ['DISPATCHED', 'RELEASED', 'UNKNOWN', 'CANCELLED'], DISPATCHED: ['RUNNING', 'FAILED', 'UNKNOWN'],
  RUNNING: ['VERIFYING', 'FAILED', 'UNKNOWN'], VERIFYING: ['COMMITTED', 'FAILED', 'UNKNOWN'], FAILED: ['RELEASED', 'UNKNOWN'], CANCELLED: ['RELEASED'],
  REJECTED: [], RELEASED: [], UNKNOWN: [], COMMITTED: [],
});
export function transitionLifecycle(from: OperationLifecycleState, to: OperationLifecycleState): OperationLifecycleState {
  if (!transitions[from].includes(to)) throw new Error(`Invalid operation lifecycle transition: ${from} -> ${to}`);
  return to;
}
export const OPERATION_LIFECYCLE_TRANSITIONS = transitions;
