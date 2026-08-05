import type { CapabilityRegistry } from './CapabilityRegistry';
import { DuplicateModuleError, MissingDependenciesError } from './PlatformErrors';
import type { PlatformDiscovery, PlatformModule, PlatformModuleInput } from './types';

/** Normalizes and freezes an externally supplied module registration. */
function normalize<Component>(input: PlatformModuleInput<Component>): PlatformModule<Component> {
  if (!input.id.trim()) throw new TypeError('Platform module id must not be empty.');
  return Object.freeze({
    ...input,
    id: input.id.trim(),
    capabilities: Object.freeze([...(input.capabilities ?? [])]),
    dependencies: Object.freeze([...(input.dependencies ?? [])]),
    experimental: input.experimental ?? false,
    enabled: input.enabled ?? true,
  });
}

/** Central, business-agnostic registry for all platform module descriptions. */
export class PlatformRegistry implements PlatformDiscovery {
  private readonly modules = new Map<string, PlatformModule>();
  constructor(private readonly capabilityRegistry: CapabilityRegistry) {}

  /** Registers a module and returns its immutable normalized description. */
  register<Component>(input: PlatformModuleInput<Component>): PlatformModule<Component> {
    const module = normalize(input);
    if (this.modules.has(module.id)) throw new DuplicateModuleError(module.id);
    this.modules.set(module.id, module);
    this.capabilityRegistry.register(module.id, module.capabilities);
    return module;
  }

  /** Removes a module and its associated capability declaration. */
  unregister(id: string): boolean {
    const removed = this.modules.delete(id);
    if (removed) this.capabilityRegistry.unregister(id);
    return removed;
  }

  /** Returns a registered module by identifier. */
  get<Component = unknown>(id: string): PlatformModule<Component> | undefined {
    return this.modules.get(id) as PlatformModule<Component> | undefined;
  }

  /** Returns an immutable snapshot of all registered modules. */
  getAll(): readonly PlatformModule[] { return [...this.modules.values()]; }

  /** Reports whether an identifier is registered. */
  has(id: string): boolean { return this.modules.has(id); }

  /** Removes all modules and capability declarations. */
  clear(): void { this.modules.clear(); this.capabilityRegistry.clear(); }

  /** Validates dependencies of every enabled module and returns normally when valid. */
  validateDependencies(): void {
    for (const module of this.modules.values()) {
      if (!module.enabled) continue;
      const missing = module.dependencies.filter((id) => !this.modules.get(id)?.enabled);
      if (missing.length > 0) throw new MissingDependenciesError(module.id, missing);
    }
  }
}
