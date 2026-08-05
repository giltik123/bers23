import type { PlatformContext, PlatformInitializer } from '../../PlatformContext';

/** Registers FASHN discovery metadata without importing its provider implementation. */
export class FASHNProviderInitializer implements PlatformInitializer {
  /** Adds FASHN to the provider registry. */
  register({ providers }: PlatformContext): void {
    providers.register({
      id: 'fashn',
      name: 'FASHN',
      version: '1.0.0',
      author: 'Berserk',
      description: 'Virtual fashion try-on provider.',
      category: 'provider',
      capabilities: ['try-on', 'virtual-try-on'],
      dependencies: ['image-pipeline'],
      enabled: true,
    });
  }
}
