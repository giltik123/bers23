export function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value as Record<string, unknown>)) immutable(item);
    Object.freeze(value);
  }
  return value;
}

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
