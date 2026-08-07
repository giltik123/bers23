import type { ExecutionScope } from '../execution';

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) return value as Readonly<T>;
  seen.add(value as object);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested, seen);
  return Object.freeze(value) as Readonly<T>;
}

export const clamp = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const sameScope = (left: ExecutionScope, right: ExecutionScope): boolean => (
  left.tenantId === right.tenantId && left.projectId === right.projectId && left.userId === right.userId
);
