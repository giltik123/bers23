export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) return value as Readonly<T>;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}
export function clone<T>(value: T): T { return structuredClone(value); }
export function assertScope(scope: { tenantId?: string; projectId?: string; userId?: string }): void {
  if (!scope.tenantId || !scope.projectId || !scope.userId) throw new Error('tenantId, projectId and userId are required.');
}
