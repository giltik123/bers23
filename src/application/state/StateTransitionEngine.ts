import type { AIApplicationStateStatus } from './AIApplicationState';

const allowedTransitions: Readonly<Record<AIApplicationStateStatus, readonly AIApplicationStateStatus[]>> = {
  INITIALIZING: ['READY', 'FAILED'],
  READY: ['PROCESSING', 'PAUSED', 'FAILED'],
  PROCESSING: ['WAITING_USER', 'COMPLETED', 'FAILED', 'PAUSED'],
  WAITING_USER: ['PROCESSING', 'FAILED', 'PAUSED'],
  PAUSED: ['READY', 'PROCESSING', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export class StateTransitionEngine {
  canTransition(from: AIApplicationStateStatus, to: AIApplicationStateStatus): boolean {
    return allowedTransitions[from].includes(to);
  }

  assertTransition(from: AIApplicationStateStatus, to: AIApplicationStateStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(`Invalid application state transition: ${from} -> ${to}.`);
    }
  }
}
