import { CategoryRegistry } from './CategoryRegistry';

/** Discovers built-in and externally contributed recipe modules. */
export class RecipeRegistry extends CategoryRegistry<'recipe'> {}
