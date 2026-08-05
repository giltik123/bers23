import type { RoutingDecision } from './RoutingDecision';

/** Structured debug trace suitable for developer tooling. */
export interface RoutingDebugTrace { readonly request: string; readonly detected: readonly string[]; readonly selected: { readonly capabilities: readonly string[]; readonly providers: readonly string[] }; readonly rejected: readonly string[]; }

/** Produces deterministic, side-effect-free route diagnostics. */
export class RoutingDebugger {
  create(decision: RoutingDecision): RoutingDebugTrace {
    return Object.freeze({
      request: decision.request,
      detected: decision.evidence,
      selected: Object.freeze({ capabilities: decision.capabilities, providers: decision.providers }),
      rejected: Object.freeze([
        ...decision.fallback.unavailableProviders.map((id) => `${id}: unavailable`),
        ...decision.validation.errors,
        ...decision.policy.violations,
      ]),
    });
  }
}
