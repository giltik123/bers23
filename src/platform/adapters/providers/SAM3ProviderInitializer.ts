import type { PlatformContext, PlatformInitializer } from '../../PlatformContext';

/** Registers SAM 3 discovery metadata without importing its provider implementation. */
export class SAM3ProviderInitializer implements PlatformInitializer {
  /** Adds SAM 3 to the provider registry. */
  register({ providers }: PlatformContext): void {
    providers.register({
      id: 'sam3',
      name: 'SAM 3',
      version: '1.0.0',
      author: 'Berserk',
      description: 'Object segmentation and mask generation provider.',
      category: 'provider',
      capabilities: ['segmentation', 'mask-generation'],
      dependencies: ['image-pipeline'],
      enabled: true,
    });
  }
}
