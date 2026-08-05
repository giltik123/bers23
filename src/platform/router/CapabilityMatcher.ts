import type { PlatformContext } from '../PlatformContext';
import type { CapabilityGraph } from './CapabilityGraph';

/** Platform modules and providers that can contribute to a capability route. */
export interface CapabilityMatch { readonly modules: readonly string[]; readonly providers: readonly string[]; readonly unmatched: readonly string[]; }

/** Matches resolved capabilities against live Platform discovery metadata. */
export class CapabilityMatcher {
  constructor(private readonly platform: PlatformContext, private readonly graph: CapabilityGraph) {}

  /** Finds enabled modules and graph-declared providers for the required capabilities. */
  match(capabilities: readonly string[]): CapabilityMatch {
    const moduleIds = new Set<string>();
    const providerIds = new Set<string>();
    const unmatched: string[] = [];

    for (const capability of capabilities) {
      const discovered = this.platform.capabilities.find(capability)
        .filter((id) => this.platform.registry.get(id)?.enabled);
      const declaredProviders = (this.graph.get(capability)?.providers ?? [])
        .filter((id) => this.platform.providers.get(id)?.enabled);
      for (const id of [...discovered, ...declaredProviders]) {
        if (this.platform.providers.has(id)) providerIds.add(id); else moduleIds.add(id);
      }
      if (discovered.length === 0 && declaredProviders.length === 0) unmatched.push(capability);
    }

    return Object.freeze({ modules: Object.freeze([...moduleIds]), providers: Object.freeze([...providerIds]), unmatched: Object.freeze(unmatched) });
  }
}
