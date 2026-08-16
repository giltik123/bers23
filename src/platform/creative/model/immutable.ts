export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
export const round = (value: number): number => Math.round(value * 1e6) / 1e6;
export const immutable = <T>(value: T): Readonly<T> => { if (value && typeof value === 'object') { for (const child of Object.values(value as object)) immutable(child); Object.freeze(value); } return value; };
export const stableHash = (value: string): number => { let hash = 2166136261; for (const character of value.toLowerCase()) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0) / 4294967295; };
