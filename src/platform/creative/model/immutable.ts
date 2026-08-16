export const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
export const immutable = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value as object).forEach(immutable); Object.freeze(value); }
  return value;
};
export const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
export const stableHash = (text: string) => { let hash = 2166136261; for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619); return hash >>> 0; };
