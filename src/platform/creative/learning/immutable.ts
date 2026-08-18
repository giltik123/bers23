export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value as Readonly<T>;
}
export function immutableCopy<T>(value: T): Readonly<T> { return deepFreeze(structuredClone(value)); }
export function stableIdentity(parts: unknown[]): string { return parts.map(v => encodeURIComponent(String(v))).join(':'); }
