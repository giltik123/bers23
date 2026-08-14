import { intelligenceDeepFreeze } from './immutable';
import type { ProviderDescriptor, ProviderSelectionRequest } from './types';
export class ProviderCapabilityGraph {
  private providers = new Map<string, ProviderDescriptor>();
  register(provider: ProviderDescriptor): ProviderDescriptor { if (!provider.id || this.providers.has(provider.id)) throw new Error(`Duplicate provider: ${provider.id}`); if (!provider.capabilities.length) throw new Error('Provider requires capabilities'); const value = intelligenceDeepFreeze({ ...provider, capabilities: provider.capabilities.map((c) => ({ ...c, formats: [...c.formats], constraints: c.constraints?.map((x) => ({ ...x })) })) }) as ProviderDescriptor; this.providers.set(value.id, value); return value; }
  remove(id: string): boolean { return this.providers.delete(id); }
  all(): readonly ProviderDescriptor[] { return intelligenceDeepFreeze([...this.providers.values()].sort((a, b) => a.id.localeCompare(b.id))); }
  candidates(request: ProviderSelectionRequest): readonly ProviderDescriptor[] { return intelligenceDeepFreeze(this.all().filter((provider) => provider.capabilities.some((capability) => capability.name === request.capability && (!request.format || capability.formats.includes(request.format)) && (!request.width || request.width <= capability.maxWidth) && (!request.height || request.height <= capability.maxHeight)))); }
}
