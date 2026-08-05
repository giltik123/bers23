/** Built-in platform component categories and future extension categories. */
export type PlatformCategory =
  | 'provider'
  | 'recipe'
  | 'workspace'
  | 'automation'
  | 'ai-module'
  | 'plugin'
  | 'sdk'
  | 'marketplace'
  | 'enterprise';

/** Known capabilities with an open string extension for third-party modules. */
export type CapabilityId =
  | 'segmentation'
  | 'mask-editing'
  | 'face-editing'
  | 'background-editing'
  | 'try-on'
  | 'streaming'
  | 'batch'
  | 'jobs'
  | 'scene-memory'
  | 'recipes'
  | (string & {});

/** Immutable descriptive metadata shared by every registered module. */
export interface PlatformMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly category: PlatformCategory;
  readonly capabilities: readonly CapabilityId[];
  readonly dependencies: readonly string[];
  readonly experimental: boolean;
  readonly enabled: boolean;
}

/** Complete module registration containing metadata and an optional runtime component. */
export interface PlatformModule<Component = unknown> extends PlatformMetadata {
  readonly component?: Component;
}

/** Input accepted by registries; collection fields have safe defaults. */
export type PlatformModuleInput<Component = unknown> =
  Omit<PlatformModule<Component>, 'capabilities' | 'dependencies' | 'experimental' | 'enabled'>
  & Partial<Pick<PlatformModule<Component>, 'capabilities' | 'dependencies' | 'experimental' | 'enabled'>>;

/** Read-only platform discovery contract exposed to modules and SDK consumers. */
export interface PlatformDiscovery {
  get<Component = unknown>(id: string): PlatformModule<Component> | undefined;
  getAll(): readonly PlatformModule[];
  has(id: string): boolean;
}
