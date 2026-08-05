import type { ProviderRegistry } from '../../ProviderRegistry';
import { ProviderUnavailableError } from './ProviderError';
import type { ProviderExecutor } from './ProviderExecutor';

/** Runtime binding kept separate from immutable provider metadata. */
export interface ProviderRuntimeBinding { readonly id: string; readonly capabilities: readonly string[]; readonly executor: ProviderExecutor; }

/** Binds registered provider metadata to injected runtime executors. */
export class ProviderRuntimeRegistry {
  private readonly bindings = new Map<string, ProviderRuntimeBinding>();
  constructor(private readonly providers?: ProviderRegistry) {}
  bind(executor: ProviderExecutor): ProviderRuntimeBinding {
    if (this.providers && !this.providers.has(executor.id)) throw new Error(`Provider metadata "${executor.id}" is not registered.`);
    const metadataCapabilities = this.providers?.get(executor.id)?.capabilities;
    const capabilities = Object.freeze([...new Set([...(metadataCapabilities ?? []), ...executor.capabilities])]);
    const binding = Object.freeze({ id: executor.id, capabilities, executor }); this.bindings.set(executor.id, binding); return binding;
  }
  unbind(id: string): boolean { return this.bindings.delete(id); }
  get(id: string): ProviderRuntimeBinding | undefined { return this.bindings.get(id); }
  getByCapability(capability: string): readonly ProviderRuntimeBinding[] { return Object.freeze([...this.bindings.values()].filter((binding) => binding.capabilities.includes(capability))); }
  require(id: string): ProviderRuntimeBinding { const binding = this.get(id); if (!binding) throw new ProviderUnavailableError(id); return binding; }
}
