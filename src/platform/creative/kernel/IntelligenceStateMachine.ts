import { immutable } from './immutable';
import type { IntelligenceState, KernelDependencies, StateTransition } from './types';
export class IntelligenceStateMachine {
  static readonly states: readonly IntelligenceState[] = immutable(['IDLE', 'OBSERVE', 'UNDERSTAND', 'EXPLORE', 'REASON', 'DEBATE', 'OPTIMIZE', 'REFLECT', 'VALIDATE', 'COMMIT', 'LEARN', 'COMPLETE']);
  constructor(private readonly dependencies: KernelDependencies) {}
  transition(from: IntelligenceState, to: IntelligenceState, reason: string, trigger: string, confidence: number): StateTransition { const index = IntelligenceStateMachine.states.indexOf(from); const target = IntelligenceStateMachine.states.indexOf(to); if (index < 0 || target !== Math.min(index + 1, IntelligenceStateMachine.states.length - 1)) throw new Error(`Invalid intelligence state transition ${from} -> ${to}`); return immutable({ from, to, reason, trigger, confidence: Math.max(0, Math.min(1, confidence)), createdAt: this.dependencies.now() }); }
  run(trigger: string): readonly StateTransition[] { return immutable(IntelligenceStateMachine.states.slice(1).map((to, index) => this.transition(IntelligenceStateMachine.states[index], to, `Advance to ${to.toLowerCase()}`, trigger, Number((.65 + index * .025).toFixed(3))))); }
}
