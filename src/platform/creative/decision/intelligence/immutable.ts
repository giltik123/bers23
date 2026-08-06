export function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach((entry) => immutable(entry));
    Object.freeze(value);
  }
  return value;
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
