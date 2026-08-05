import type { CapabilityId } from './types';

/** Immutable capability view returned for a registered module. */
export class CapabilitySet {
  private readonly values: ReadonlySet<CapabilityId>;
  constructor(capabilities: Iterable<CapabilityId> = []) { this.values = new Set(capabilities); }
  /** Reports whether this module supports a capability. */
  supports(capability: CapabilityId): boolean { return this.values.has(capability); }
  /** Returns all capabilities as an immutable snapshot. */
  getAll(): readonly CapabilityId[] { return [...this.values]; }
}

/** Tracks declared module capabilities independently from feature enablement. */
export class CapabilityRegistry {
  private readonly capabilities = new Map<string, CapabilitySet>();
  /** Registers or replaces a module's declared capabilities. */
  register(moduleId: string, capabilities: Iterable<CapabilityId>): CapabilitySet {
    const set = new CapabilitySet(capabilities);
    this.capabilities.set(moduleId, set);
    return set;
  }
  /** Removes a module's capability declaration. */
  unregister(moduleId: string): boolean { return this.capabilities.delete(moduleId); }
  /** Returns the capabilities declared by a module. */
  get(moduleId: string): CapabilitySet | undefined { return this.capabilities.get(moduleId); }
  /** Reports whether a module supports a capability. */
  supports(moduleId: string, capability: CapabilityId): boolean { return this.capabilities.get(moduleId)?.supports(capability) ?? false; }
  /** Finds every module declaring a capability. */
  find(capability: CapabilityId): readonly string[] { return [...this.capabilities].filter(([, set]) => set.supports(capability)).map(([id]) => id); }
  /** Removes all capability declarations. */
  clear(): void { this.capabilities.clear(); }
}
