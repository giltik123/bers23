import type { ProviderIntelligenceScope } from './types';
export function intelligenceDeepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> { if (value === null || typeof value !== 'object' || seen.has(value as object)) return value as Readonly<T>; seen.add(value as object); for (const nested of Object.values(value as Record<string, unknown>)) intelligenceDeepFreeze(nested, seen); return Object.freeze(value) as Readonly<T>; }
export const sameIntelligenceScope = (a: ProviderIntelligenceScope, b: ProviderIntelligenceScope): boolean => a.tenantId === b.tenantId && a.projectId === b.projectId && a.userId === b.userId;
export const clamp = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
