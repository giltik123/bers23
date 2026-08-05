import { container, type ServiceContainer } from '../core/container';
import {
  AIAgentInitializer,
  EditingEngineInitializer,
  FASHNProviderInitializer,
  ImagePipelineInitializer,
  PlannerInitializer,
  RecipeLibraryInitializer,
  ReveProviderInitializer,
  SAM3ProviderInitializer,
  SceneMemoryInitializer,
  WorkspaceInitializers,
} from '../platform/adapters';
import { createPlatform, registerPlatformServices, type PlatformRuntime } from '../platform';

/** Serializable snapshot returned by the runtime inspection API. */
export interface PlatformInspection {
  readonly modules: number;
  readonly providers: number;
  readonly recipes: number;
  readonly workspaces: number;
  readonly automations: number;
  readonly aiModules: number;
  readonly capabilities: readonly string[];
}

/** Started Platform runtime exposed by the application composition root. */
export interface ApplicationRuntime extends PlatformRuntime {
  /** Returns the current platform module and capability inventory. */
  inspect(): PlatformInspection;
}

/** Creates Core and Platform integration, registers metadata, and completes bootstrap. */
export async function createApplication(services: ServiceContainer = container): Promise<ApplicationRuntime> {
  const runtime = createPlatform([
    new ImagePipelineInitializer(),
    new PlannerInitializer(),
    new SceneMemoryInitializer(),
    new SAM3ProviderInitializer(),
    new ReveProviderInitializer(),
    new FASHNProviderInitializer(),
    new EditingEngineInitializer(),
    new RecipeLibraryInitializer(),
    new AIAgentInitializer(),
    new WorkspaceInitializers(),
  ]);

  registerPlatformServices(services, runtime);
  await runtime.bootstrap.start();

  return Object.freeze({
    ...runtime,
    inspect: (): PlatformInspection => {
      const modules = runtime.context.registry.getAll();
      return Object.freeze({
        modules: modules.length,
        providers: runtime.context.providers.getAll().length,
        recipes: runtime.context.recipes.getAll().length,
        workspaces: runtime.context.workspaces.getAll().length,
        automations: runtime.context.automations.getAll().length,
        aiModules: runtime.context.aiModules.getAll().length,
        capabilities: Object.freeze([...new Set(modules.flatMap((module) => module.capabilities))].sort()),
      });
    },
  });
}
