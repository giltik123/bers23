export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) return value as Readonly<T>;
  // ECMAScript engines reject Object.freeze on non-empty typed arrays. The
  // preceding structuredClone still gives artifacts private, non-aliased pixel
  // storage, while the containing image/artifact records remain immutable.
  if (ArrayBuffer.isView(value)) return value as Readonly<T>;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value) as Readonly<T>;
}
export function immutableClone<T>(value: T): Readonly<T> { return deepFreeze(structuredClone(value)); }
