import type { PlatformContext, PlatformInitializer } from '../../PlatformContext';

/** Registers Scene Memory metadata without importing scene business logic. */
export class SceneMemoryInitializer implements PlatformInitializer {
  /** Adds Scene Memory to AI module discovery. */
  register({ aiModules }: PlatformContext): void {
    aiModules.register({ id: 'scene-memory', name: 'Scene Memory', version: '1.0.0', author: 'Berserk', description: 'Scene understanding and edit consistency memory.', category: 'ai-module', capabilities: ['scene-analysis', 'style-preservation', 'identity-consistency'], dependencies: ['image-pipeline'], enabled: true });
  }
}
