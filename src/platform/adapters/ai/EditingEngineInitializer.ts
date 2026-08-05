import type { PlatformContext, PlatformInitializer } from '../../PlatformContext';

/** Registers Editing Engine metadata without importing editing business logic. */
export class EditingEngineInitializer implements PlatformInitializer {
  /** Adds Editing Engine to AI module discovery. */
  register({ aiModules }: PlatformContext): void {
    aiModules.register({ id: 'editing-engine', name: 'Editing Engine', version: '1.0.0', author: 'Berserk', description: 'AI generation, composition, and provider routing engine.', category: 'ai-module', capabilities: ['ai-generation', 'image-composition', 'provider-routing'], dependencies: ['image-pipeline', 'reve'], enabled: true });
  }
}
