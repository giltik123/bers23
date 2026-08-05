export function immutableEditingSnapshot<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => immutableEditingSnapshot(item))) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableEditingSnapshot(item)]))) as T;
}
