import type { AIModuleRegistry } from './AIModuleRegistry';
import type { AutomationRegistry } from './AutomationRegistry';
import type { CapabilityRegistry } from './CapabilityRegistry';
import type { ExtensionRegistry } from './ExtensionRegistry';
import type { PlatformRegistry } from './PlatformRegistry';
import type { ProviderRegistry } from './ProviderRegistry';
import type { RecipeRegistry } from './RecipeRegistry';
import type { WorkspaceRegistry } from './WorkspaceRegistry';

/** Complete set of discovery and registration surfaces passed to module initializers. */
export interface PlatformContext {
  readonly registry: PlatformRegistry;
  readonly capabilities: CapabilityRegistry;
  readonly providers: ProviderRegistry;
  readonly recipes: RecipeRegistry;
  readonly workspaces: WorkspaceRegistry;
  readonly automations: AutomationRegistry;
  readonly aiModules: AIModuleRegistry;
  readonly plugins: ExtensionRegistry<'plugin'>;
  readonly sdk: ExtensionRegistry<'sdk'>;
  readonly marketplace: ExtensionRegistry<'marketplace'>;
  readonly enterprise: ExtensionRegistry<'enterprise'>;
}

/** Self-registration hook implemented by built-in or external modules. */
export interface PlatformInitializer {
  /** Registers module descriptions and runtime components into the supplied context. */
  register(context: PlatformContext): void | Promise<void>;
}
