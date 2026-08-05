import type { PlatformContext } from '../PlatformContext';
import type { CapabilityGraph } from './CapabilityGraph';
import type { CapabilityMatch } from './CapabilityMatcher';

/** Provider liveness function injected by runtime health infrastructure. */
export type ProviderAvailability = (providerId: string) => boolean | Promise<boolean>;

/** Policy output used to build a final routing decision. */
export interface PolicyDecision { readonly modules: readonly string[]; readonly providers: readonly string[]; readonly unavailableProviders: readonly string[]; readonly fallback: boolean; readonly reason?: string; }

const preferredModules: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'face-editing': ['editing-engine'],
  'identity-preservation': ['scene-memory'],
  'scene-memory': ['scene-memory'],
  'image-edit': ['editing-engine'],
  'background-edit': ['editing-engine'],
  'scene-consistency': ['scene-memory'],
  'person-preservation': ['scene-memory'],
  'virtual-try-on': ['editing-engine'],
  'garment-processing': ['image-pipeline'],
  'person-analysis': ['image-pipeline'],
});

/** Applies module-combination and provider-fallback rules to matched capabilities. */
export class CapabilityPolicy {
  constructor(
    private readonly platform: PlatformContext,
    private readonly graph: CapabilityGraph,
    private readonly isProviderAvailable: ProviderAvailability = (id) => Boolean(platform.providers.get(id)?.enabled),
  ) {}

  /** Selects enabled modules and live providers, returning a fallback decision when needed. */
  async apply(capabilities: readonly string[], match: CapabilityMatch): Promise<PolicyDecision> {
    const modules = new Set(match.modules);
    for (const capability of capabilities) {
      for (const id of preferredModules[capability] ?? []) {
        if (this.platform.aiModules.get(id)?.enabled) modules.add(id);
      }
    }
    if (modules.has('editing-engine') && this.platform.aiModules.get('image-pipeline')?.enabled) modules.add('image-pipeline');

    const providerPriority = (id: string): number => Math.max(0, ...capabilities
      .filter((capability) => this.graph.get(capability)?.providers.includes(id))
      .map((capability) => this.graph.get(capability)?.priority ?? 0));
    const candidates = [...match.providers].sort((left, right) => providerPriority(right) - providerPriority(left));
    const checks = await Promise.all(candidates.map(async (id) => ({ id, available: await this.isProviderAvailable(id) })));
    const providers = checks.filter(({ available }) => available).map(({ id }) => id);
    const unavailableProviders = checks.filter(({ available }) => !available).map(({ id }) => id);
    const requiredUnavailable = capabilities.some((capability) => {
      const required = this.graph.get(capability)?.providers ?? [];
      return required.length > 0 && required.every((id) => unavailableProviders.includes(id));
    });
    const fallback = requiredUnavailable;

    return Object.freeze({
      modules: Object.freeze([...modules]),
      providers: Object.freeze(providers),
      unavailableProviders: Object.freeze(unavailableProviders),
      fallback,
      reason: fallback ? `Required provider unavailable. Alternative route uses safe degradation: create an image editing preview while ${unavailableProviders.join(', ')} is unavailable.` : undefined,
    });
  }
}
