import type { MemoryCategory } from './MemoryTypes';

/** Filters applied after mandatory privacy-boundary validation. */
export interface MemoryQuery {
  readonly namespace?: string; readonly categories?: readonly MemoryCategory[]; readonly tags?: readonly string[];
  readonly projectId?: string; readonly createdAfter?: string; readonly createdBefore?: string;
  readonly minimumConfidence?: number; readonly limit?: number;
}
