import { immutable } from './immutable';
import type { Capability, IntelligencePlugin, KernelDependencies, PluginRegistration } from './types';

export class CapabilityRegistry {
  private readonly registrations = new Map<string, PluginRegistration>();
  constructor(private readonly dependencies: KernelDependencies) {}
  register(plugin: IntelligencePlugin): PluginRegistration { if (this.registrations.has(plugin.id)) throw new Error(`Plugin ${plugin.id} is already registered`); const registration = immutable({ plugin, status: 'ACTIVE' as const, registeredAt: this.dependencies.now() }); this.registrations.set(plugin.id, registration); return registration; }
  unregister(pluginId: string): void { if (!this.registrations.delete(pluginId)) throw new Error(`Unknown plugin ${pluginId}`); }
  setStatus(pluginId: string, status: PluginRegistration['status']): PluginRegistration { const current = this.require(pluginId); const next = immutable({ ...current, status }); this.registrations.set(pluginId, next); return next; }
  find(capabilities: readonly Capability[]): readonly PluginRegistration[] { return immutable([...this.registrations.values()].filter((item) => item.status !== 'DISABLED' && capabilities.every((capability) => item.plugin.capabilities.includes(capability))).sort((a, b) => a.plugin.id.localeCompare(b.plugin.id))); }
  all(): readonly PluginRegistration[] { return immutable([...this.registrations.values()].sort((a, b) => a.plugin.id.localeCompare(b.plugin.id))); }
  get(pluginId: string): PluginRegistration { return this.require(pluginId); }
  private require(pluginId: string) { const item = this.registrations.get(pluginId); if (!item) throw new Error(`Unknown plugin ${pluginId}`); return item; }
}
