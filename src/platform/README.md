# Platform Layer

The Platform layer makes application modules self-describing and discoverable without importing Planner, Recipes, Providers, Workspace, Automation, Agent, Pipeline, or UI code. Its only optional integration is the Core dependency-injection container.

## Architecture

```text
Core → Platform → business modules → UI
```

`PlatformRegistry` owns immutable module descriptions. `CapabilityRegistry` owns capability discovery and intentionally does not represent feature flags. Category registries are filtered views over the same central registry, so a registration is immediately discoverable from both surfaces.

| Service | Responsibility |
| --- | --- |
| `PlatformRegistry` | Register, unregister, retrieve, enumerate, clear, and validate module dependency metadata. |
| `CapabilityRegistry` | Answer capability queries and find modules by capability. |
| `ProviderRegistry` | Discover provider registrations without concrete provider imports. |
| `RecipeRegistry` | Discover built-in and plugin-contributed recipe registrations. |
| `WorkspaceRegistry` | Discover workspace registrations. |
| `AutomationRegistry` | Discover automation registrations. |
| `AIModuleRegistry` | Discover Agent, Scene Memory, Planner, Pipeline, and Editing Engine registrations. |
| `ExtensionRegistry` | Reserve typed registration surfaces for plugins, SDK packages, marketplace entries, and enterprise modules. |
| `PlatformBootstrap` | Execute injected self-registration hooks once and validate dependencies at startup. |

## Registration

Business modules provide `PlatformInitializer` implementations from their own composition boundary. Platform never imports them:

```ts
const runtime = createPlatform([
  {
    register({ providers }) {
      providers.register({
        id: 'example-provider',
        name: 'Example Provider',
        version: '1.0.0',
        author: 'Example',
        description: 'Example external provider.',
        category: 'provider',
        capabilities: ['mask-editing', 'batch'],
        dependencies: ['editing-pipeline'],
        component: exampleProvider,
      });
    },
  },
]);

await runtime.bootstrap.start();
runtime.context.providers.supports('example-provider', 'mask-editing');
```

Registration order is unrestricted. `PlatformBootstrap.start()` validates the complete graph after every initializer has run. Missing or disabled dependencies produce `MissingDependenciesError` containing the dependent module ID and all missing IDs.

## Core DI integration

`registerPlatformServices(container, runtime)` exposes the central registry, capabilities, category registries, and bootstrap through the existing Core container. This is optional: Platform registries remain usable without a global container.

## Integration boundary

This sprint deliberately does not import or modify existing business modules. Their registration hooks can be supplied later from the application composition root without changing Platform source. External plugins use the same metadata and initializer contracts as built-in modules; no Platform source edit is required to add a new provider, recipe, workspace, automation, AI module, plugin, SDK integration, marketplace item, or enterprise module.
