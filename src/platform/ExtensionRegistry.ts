import { CategoryRegistry } from './CategoryRegistry';
import type { PlatformCategory } from './types';

/** Categories reserved for external distribution and enterprise extension points. */
export type ExtensionCategory = Extract<PlatformCategory, 'plugin' | 'sdk' | 'marketplace' | 'enterprise'>;

/** Typed registration surface reserved for future external module systems. */
export class ExtensionRegistry<Category extends ExtensionCategory> extends CategoryRegistry<Category> {}
