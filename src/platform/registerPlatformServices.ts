import type { ServiceContainer } from '../core/container';
import { AIModuleRegistry } from './AIModuleRegistry';
import { AutomationRegistry } from './AutomationRegistry';
import { CapabilityRegistry } from './CapabilityRegistry';
import type { PlatformRuntime } from './createPlatform';
import { PlatformBootstrap } from './PlatformBootstrap';
import { PlatformRegistry } from './PlatformRegistry';
import { ProviderRegistry } from './ProviderRegistry';
import { RecipeRegistry } from './RecipeRegistry';
import { WorkspaceRegistry } from './WorkspaceRegistry';

/** Registers a composed platform runtime in the Core dependency-injection container. */
export function registerPlatformServices(container: ServiceContainer, runtime: PlatformRuntime): ServiceContainer {
  const { context } = runtime;
  container.registerSingleton(PlatformRegistry, context.registry);
  container.registerSingleton(CapabilityRegistry, context.capabilities);
  container.registerSingleton(ProviderRegistry, context.providers);
  container.registerSingleton(RecipeRegistry, context.recipes);
  container.registerSingleton(WorkspaceRegistry, context.workspaces);
  container.registerSingleton(AutomationRegistry, context.automations);
  container.registerSingleton(AIModuleRegistry, context.aiModules);
  container.registerSingleton(PlatformBootstrap, runtime.bootstrap);
  return container;
}
