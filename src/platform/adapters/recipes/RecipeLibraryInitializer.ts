import type { PlatformContext, PlatformInitializer } from '../../PlatformContext';

/** Registers RecipeLibrary metadata without importing recipe business logic. */
export class RecipeLibraryInitializer implements PlatformInitializer {
  /** Adds the built-in recipe catalog to discovery. */
  register({ recipes }: PlatformContext): void {
    recipes.register({
      id: 'recipe-library',
      name: 'RecipeLibrary',
      version: '1.0.0',
      author: 'Berserk',
      description: 'Built-in image-editing recipe and template catalog.',
      category: 'recipe',
      capabilities: ['image-edit-recipes', 'template-processing'],
      dependencies: ['planner', 'editing-engine'],
      enabled: true,
    });
  }
}
