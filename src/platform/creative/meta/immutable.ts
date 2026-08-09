export function deepImmutable<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepImmutable);
    Object.freeze(value);
  }
  return value;
}
export const clamp = (value: number): number => Math.max(0, Math.min(1, value));
export const rounded = (value: number): number => Number(clamp(value).toFixed(4));
