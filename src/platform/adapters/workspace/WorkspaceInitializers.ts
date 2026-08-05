import type { PlatformContext, PlatformInitializer } from '../../PlatformContext';

const workspaces = Object.freeze([
  { id: 'portrait-workspace', name: 'Portrait Workspace', description: 'Portrait, face, skin, hair, and expression tools.' },
  { id: 'fashion-workspace', name: 'Fashion Workspace', description: 'Fashion editing and virtual try-on tools.' },
  { id: 'product-workspace', name: 'Product Workspace', description: 'Commercial product photography tools.' },
  { id: 'automotive-workspace', name: 'Automotive Workspace', description: 'Automotive retouching and presentation tools.' },
  { id: 'real-estate-workspace', name: 'Real Estate Workspace', description: 'Real-estate and architectural editing tools.' },
  { id: 'landscape-workspace', name: 'Landscape Workspace', description: 'Landscape, sky, weather, and nature tools.' },
  { id: 'food-workspace', name: 'Food Workspace', description: 'Food photography enhancement tools.' },
  { id: 'creative-workspace', name: 'Creative Workspace', description: 'Creative and experimental image-editing tools.' },
  { id: 'social-workspace', name: 'Social Workspace', description: 'Social-media image preparation tools.' },
  { id: 'universal-workspace', name: 'Universal Workspace', description: 'General-purpose image-editing tools.' },
]);

/** Registers metadata for all ten existing workspaces. */
export class WorkspaceInitializers implements PlatformInitializer {
  /** Adds each workspace as an independently discoverable module. */
  register({ workspaces: registry }: PlatformContext): void {
    for (const workspace of workspaces) {
      registry.register({
        ...workspace,
        version: '1.0.0',
        author: 'Berserk',
        category: 'workspace',
        capabilities: ['adaptive-ui', 'context-tools'],
        dependencies: ['recipe-library'],
        enabled: true,
      });
    }
  }
}
