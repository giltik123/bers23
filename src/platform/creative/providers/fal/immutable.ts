export function falDeepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) return value as Readonly<T>;
  seen.add(value as object);
  if (ArrayBuffer.isView(value)) return value as Readonly<T>;
  for (const nested of Object.values(value as Record<string, unknown>)) falDeepFreeze(nested, seen);
  return Object.freeze(value) as Readonly<T>;
}
export const sameFalScope = (a: { tenantId: string; projectId: string; userId: string }, b: { tenantId: string; projectId: string; userId: string }): boolean => a.tenantId === b.tenantId && a.projectId === b.projectId && a.userId === b.userId;
export function sanitized<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sanitized) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !/authorization|api[-_]?key|token|secret/i.test(key)).map(([key, nested]) => [key, sanitized(nested)])) as T;
}
