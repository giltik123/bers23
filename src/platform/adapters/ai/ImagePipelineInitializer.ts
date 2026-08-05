import type { PlatformContext, PlatformInitializer } from '../../PlatformContext';

/** Registers Image Pipeline metadata without importing pipeline business logic. */
export class ImagePipelineInitializer implements PlatformInitializer {
  /** Adds Image Pipeline to AI module discovery. */
  register({ aiModules }: PlatformContext): void {
    aiModules.register({ id: 'image-pipeline', name: 'Image Pipeline', version: '1.0.0', author: 'Berserk', description: 'Image preparation, optimization, and metadata management.', category: 'ai-module', capabilities: ['image-processing', 'optimization', 'metadata-management'], enabled: true });
  }
}
