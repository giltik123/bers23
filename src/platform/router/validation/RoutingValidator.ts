import type { PlatformContext } from '../../PlatformContext';
import type { CapabilityGraph } from '../CapabilityGraph';
import type { RoutingDecision } from '../RoutingDecision';

/** Result of validating a route before execution. */
export interface RoutingValidationResult { readonly valid: boolean; readonly errors: readonly string[]; readonly warnings: readonly string[]; }

const moduleDependencies: Readonly<Record<string, readonly string[]>> = Object.freeze({ 'editing-engine': ['image-pipeline'] });

/** Validates capability dependencies, module dependencies, and provider compatibility. */
export class RoutingValidator {
  constructor(private readonly platform: PlatformContext, private readonly graph: CapabilityGraph) {}

  validate(decision: Pick<RoutingDecision, 'capabilities' | 'modules' | 'providers'>): RoutingValidationResult {
    const errors: string[] = [];
    const capabilities = new Set(decision.capabilities);
    for (const id of decision.capabilities) {
      const node = this.graph.get(id);
      if (!node) errors.push(`Unknown capability: ${id}.`);
      for (const dependency of node?.dependencies ?? []) if (!capabilities.has(dependency)) errors.push(`Capability "${id}" requires "${dependency}".`);
    }
    for (const moduleId of decision.modules) {
      for (const dependency of moduleDependencies[moduleId] ?? []) if (!decision.modules.includes(dependency)) errors.push(`Module "${moduleId}" requires "${dependency}".`);
    }
    for (const providerId of decision.providers) {
      const supported = new Set(this.platform.providers.get(providerId)?.capabilities ?? []);
      const graphSupported = decision.capabilities.filter((id) => this.graph.get(id)?.providers.includes(providerId));
      if (graphSupported.length === 0 && !decision.capabilities.some((id) => supported.has(id))) errors.push(`Provider "${providerId}" is incompatible with the selected capabilities.`);
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze([]) });
  }
}
