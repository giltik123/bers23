import { CategoryRegistry } from './CategoryRegistry';

/** Discovers provider modules without knowledge of concrete provider classes. */
export class ProviderRegistry extends CategoryRegistry<'provider'> {}
