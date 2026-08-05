/** Supported long-term memory categories. */
export type MemoryCategory = 'USER_PREFERENCE' | 'STYLE_MEMORY' | 'PROJECT_CONTEXT' | 'EXECUTION_PATTERN' | 'WORKFLOW_MEMORY';
/** Visibility never crosses a tenant boundary. */
export type MemoryVisibility = 'PRIVATE' | 'PROJECT' | 'TENANT';
export interface MemoryOwner { readonly tenantId: string; readonly userId: string; readonly projectId?: string; }
/** Required caller identity for every read or destructive operation. */
export interface MemoryAccessContext { readonly tenantId: string; readonly userId: string; readonly projectId?: string; }
export interface MemoryRetention { readonly expiresAt?: string; readonly confidenceHalfLifeMs?: number; }
export type MemoryClock = () => Date;
