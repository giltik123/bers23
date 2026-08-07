export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) return value as Readonly<T>;
  seen.add(value as object);
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item, seen);
  return Object.freeze(value) as Readonly<T>;
}

export const normalize = (value: string): string => value.trim().toLocaleLowerCase('en-US');
export const clamp = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const sameScope = (a: { scope: object } | object, b: object): boolean => {
  const x = 'scope' in a ? (a as { scope: object }).scope : a;
  const left = x as Record<string, unknown>, right = b as Record<string, unknown>;
  return left.tenantId === right.tenantId && left.projectId === right.projectId && left.userId === right.userId;
};
