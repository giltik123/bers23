import { CategoryRegistry } from './CategoryRegistry';

/** Discovers AI orchestration modules such as agents and engines without importing them. */
export class AIModuleRegistry extends CategoryRegistry<'ai-module'> {}
