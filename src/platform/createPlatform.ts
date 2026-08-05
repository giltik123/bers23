import { AIModuleRegistry } from './AIModuleRegistry';
import { AutomationRegistry } from './AutomationRegistry';
import { CapabilityRegistry } from './CapabilityRegistry';
import { ExtensionRegistry } from './ExtensionRegistry';
import { PlatformBootstrap } from './PlatformBootstrap';
import type { PlatformContext, PlatformInitializer } from './PlatformContext';
import { PlatformRegistry } from './PlatformRegistry';
import { ProviderRegistry } from './ProviderRegistry';
import { RecipeRegistry } from './RecipeRegistry';
import { WorkspaceRegistry } from './WorkspaceRegistry';

/** A composed platform context and its explicit bootstrap lifecycle. */
export interface PlatformRuntime { readonly context: PlatformContext; readonly bootstrap: PlatformBootstrap; }

/** Composes an isolated platform runtime from optional self-registering modules. */
export function createPlatform(initializers: readonly PlatformInitializer[] = []): PlatformRuntime {
  const capabilities = new CapabilityRegistry();
  const registry = new PlatformRegistry(capabilities);
  const context: PlatformContext = Object.freeze({
    registry,
    capabilities,
    providers: new ProviderRegistry('provider', registry, capabilities),
    recipes: new RecipeRegistry('recipe', registry, capabilities),
    workspaces: new WorkspaceRegistry('workspace', registry, capabilities),
    automations: new AutomationRegistry('automation', registry, capabilities),
    aiModules: new AIModuleRegistry('ai-module', registry, capabilities),
    plugins: new ExtensionRegistry('plugin', registry, capabilities),
    sdk: new ExtensionRegistry('sdk', registry, capabilities),
    marketplace: new ExtensionRegistry('marketplace', registry, capabilities),
    enterprise: new ExtensionRegistry('enterprise', registry, capabilities),
  });
  return Object.freeze({ context, bootstrap: new PlatformBootstrap(context, initializers) });
}
