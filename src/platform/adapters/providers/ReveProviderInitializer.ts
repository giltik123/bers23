import type { PlatformContext, PlatformInitializer } from '../../PlatformContext';

/** Registers Reve discovery metadata without importing its provider implementation. */
export class ReveProviderInitializer implements PlatformInitializer {
  /** Adds Reve to the provider registry. */
  register({ providers }: PlatformContext): void {
    providers.register({
      id: 'reve',
      name: 'Reve',
      version: '1.0.0',
      author: 'Berserk',
      description: 'General-purpose AI image editing provider.',
      category: 'provider',
      capabilities: ['editing', 'image-generation', 'mask-editing'],
      dependencies: ['image-pipeline'],
      enabled: true,
    });
  }
}
