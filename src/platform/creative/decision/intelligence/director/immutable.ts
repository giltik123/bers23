export function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach((entry) => immutable(entry));
    Object.freeze(value);
  }
  return value;
}

export const clamp = (value: number): number => Math.max(0, Math.min(1, value));
export const average = (values: readonly number[]): number => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
export const clone = <T>(value: T): T => structuredClone(value);
