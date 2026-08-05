import type { CapabilityRegistry } from './CapabilityRegistry';
import { InvalidModuleCategoryError } from './PlatformErrors';
import type { PlatformRegistry } from './PlatformRegistry';
import type { CapabilityId, PlatformCategory, PlatformModule, PlatformModuleInput } from './types';

/** Typed view over the central registry restricted to one module category. */
export class CategoryRegistry<Category extends PlatformCategory> {
  constructor(
    private readonly category: Category,
    private readonly registry: PlatformRegistry,
    private readonly capabilities: CapabilityRegistry,
  ) {}

  /** Registers a module in this category. */
  register<Component>(input: PlatformModuleInput<Component> & { readonly category: Category }): PlatformModule<Component> {
    if (input.category !== this.category) throw new InvalidModuleCategoryError(input.id, this.category, input.category);
    return this.registry.register(input);
  }

  /** Unregisters a module only when it belongs to this category. */
  unregister(id: string): boolean { return this.has(id) ? this.registry.unregister(id) : false; }

  /** Gets a module only when it belongs to this category. */
  get<Component = unknown>(id: string): PlatformModule<Component> | undefined {
    const module = this.registry.get<Component>(id);
    return module?.category === this.category ? module : undefined;
  }

  /** Gets all modules belonging to this category. */
  getAll(): readonly PlatformModule[] { return this.registry.getAll().filter((module) => module.category === this.category); }

  /** Reports whether a module belongs to this category. */
  has(id: string): boolean { return this.registry.get(id)?.category === this.category; }

  /** Reports whether a module in this category declares a capability. */
  supports(id: string, capability: CapabilityId): boolean { return this.has(id) && this.capabilities.supports(id, capability); }

  /** Removes every module belonging to this category. */
  clear(): void { for (const module of this.getAll()) this.registry.unregister(module.id); }
}
