export function immutable<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}
export const rounded = (value: number): number => Number(Math.max(0, value).toFixed(4));
export function stableHash(value: unknown): string { const serialize = (item: unknown): string => { if (item === null || typeof item !== 'object') return JSON.stringify(item); if (Array.isArray(item)) return `[${item.map(serialize).join(',')}]`; return `{${Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${serialize(nested)}`).join(',')}}`; }; const text = serialize(value); let hash = 2166136261; for (const character of text) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }
